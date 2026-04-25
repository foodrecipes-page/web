#!/usr/bin/env bash
# cleanup-bad-slugs.sh — one-shot fixer for slugs that pre-date the
# slugify hardening. Re-derives the slug from the recipe's .title field,
# renames the file, updates internal fields, rebuilds index.json,
# commits, pushes, purges jsDelivr.
#
# Safe to re-run. Skips slugs that:
#   - already pass slug_ok
#   - collide with an existing good slug
#   - have no .title in the JSON
#
# Usage:
#   bash cleanup-bad-slugs.sh           # do the work
#   bash cleanup-bad-slugs.sh --dry     # show what would change, no writes

set -uo pipefail

WORK="${WORK:-$HOME/frp-shards}"
GH_ORG="${GH_ORG:-foodrecipes-page}"
DRY=0
[[ "${1:-}" == "--dry" ]] && DRY=1

slugify() {
  local ascii
  ascii=$(printf '%s' "$1" | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null) \
    || ascii=$(printf '%s' "$1" | iconv -f UTF-8 -t ASCII//IGNORE 2>/dev/null) \
    || ascii="$1"
  printf '%s' "$ascii" \
    | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g' \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E "s/[^a-z0-9]+/-/g; s/^-+//; s/-+$//" \
    | cut -c1-80
}

slug_ok() {
  local s="$1"
  [[ -n "$s" ]] || return 1
  [[ ${#s} -ge 6 ]] || return 1
  [[ "$s" == *-* ]] || return 1
  return 0
}

bad_slug() {
  # mirror the detection from the audit query
  local s="$1"
  [[ "$s" == *-* ]] || return 0                                  # no hyphen
  [[ ${#s} -lt 6 ]] && return 0                                  # too short
  echo "$s" | LC_ALL=C grep -q '[^a-z0-9-]' && return 0          # non-ascii / weird
  return 1                                                        # good slug
}

declare -A TOUCHED_REPOS
RENAMED=0
SKIPPED=0
COLLISIONS=0

for d in "$WORK"/repos/recipes-*; do
  [[ -d "$d/recipes" ]] || continue
  letter=$(basename "$d" | sed 's/^recipes-//')
  for f in "$d"/recipes/*.json; do
    [[ -f "$f" ]] || continue
    old_slug=$(basename "$f" .json)
    bad_slug "$old_slug" || continue

    title=$(jq -r '.title // empty' "$f" 2>/dev/null)
    if [[ -z "$title" ]]; then
      echo "SKIP (no .title): $letter/$old_slug"
      SKIPPED=$((SKIPPED+1)); continue
    fi

    new_slug=$(slugify "$title")
    if ! slug_ok "$new_slug"; then
      echo "SKIP (rederived still bad: '$new_slug' from '$title'): $letter/$old_slug"
      SKIPPED=$((SKIPPED+1)); continue
    fi

    new_letter="${new_slug:0:1}"
    [[ "$new_letter" =~ [a-z] ]] || new_letter="misc"
    new_repo="$WORK/repos/recipes-$new_letter"
    new_file="$new_repo/recipes/$new_slug.json"

    if [[ "$new_file" == "$f" ]]; then
      # same path (shouldn't happen for bad slugs, but be safe)
      SKIPPED=$((SKIPPED+1)); continue
    fi

    if [[ -e "$new_file" ]]; then
      echo "COLLIDE: $letter/$old_slug -> $new_letter/$new_slug (already exists)"
      COLLISIONS=$((COLLISIONS+1)); continue
    fi

    echo "RENAME: $letter/$old_slug  ->  $new_letter/$new_slug"
    (( DRY )) && { RENAMED=$((RENAMED+1)); continue; }

    mkdir -p "$new_repo/recipes"
    # Update internal fields and write to the new path
    jq --arg s "$new_slug" \
       --arg url "https://foodrecipes.page/r/$new_slug" \
       '.slug = $s | .canonicalUrl = $url' "$f" > "$new_file" \
       || { echo "  jq write failed"; rm -f "$new_file"; SKIPPED=$((SKIPPED+1)); continue; }

    # Remove the old file (may be in a different shard)
    rm -f "$f"

    TOUCHED_REPOS["$d"]=1
    [[ "$d" != "$new_repo" ]] && TOUCHED_REPOS["$new_repo"]=1
    RENAMED=$((RENAMED+1))
  done
done

if (( DRY )); then
  echo
  echo "DRY RUN: would rename=$RENAMED  collide=$COLLISIONS  skip=$SKIPPED"
  exit 0
fi

# ---- Rebuild index.json + commit + push + purge for each touched repo ----
for repo in "${!TOUCHED_REPOS[@]}"; do
  letter=$(basename "$repo" | sed 's/^recipes-//')
  echo
  echo "==> Rebuilding $repo"
  cd "$repo" || continue

  # Rebuild index.json from disk truth
  tmp=$(mktemp)
  echo "[]" > "$tmp"
  for f in recipes/*.json; do
    [[ -f "$f" ]] || continue
    entry=$(jq --arg L "$letter" '{slug, title, tags: (.tags // []), cuisine, totalTimeMin, shard: $L}' "$f" 2>/dev/null) || continue
    jq --argjson e "$entry" '. + [$e]' "$tmp" > "$tmp.2" && mv "$tmp.2" "$tmp"
  done
  jq 'sort_by(.slug)' "$tmp" > index.json && rm -f "$tmp"

  git add -A recipes/ index.json
  if git diff --cached --quiet; then
    echo "  no changes to commit in $repo"
    continue
  fi
  git commit --quiet -m "chore: cleanup malformed slugs (rederive from title)"
  for t in 1 2 3; do
    git push --quiet origin main 2>/dev/null && break
    git pull --quiet --rebase --autostash 2>/dev/null || true
    sleep $((t*2))
  done

  # Purge jsDelivr for the changed slugs + the index
  curl -fsS -m 10 "https://purge.jsdelivr.net/gh/$GH_ORG/recipes-$letter@main/index.json" >/dev/null 2>&1 &
done
wait

echo
echo "DONE. renamed=$RENAMED  collide=$COLLISIONS  skip=$SKIPPED"
echo "Touched repos: ${!TOUCHED_REPOS[*]}"
