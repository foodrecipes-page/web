#!/usr/bin/env bash
# Generates ONE recipe into the next shard (round-robin) and pushes it.
# Invoked by n8n every minute. Safe to run concurrently — each run picks a
# different letter from .cursor and each shard is a separate repo.
#
# Requires: ollama running on :11434, jq, curl, git (with SSH key loaded).
# Env overrides: WORK (default $HOME/frp-shards), MODEL (default qwen2.5:3b).

set -euo pipefail

WORK="${WORK:-$HOME/frp-shards}"
MODEL="${MODEL:-qwen2.5:3b}"
ORG="foodrecipes-page"
LETTERS=(a b c d e f g h i j k l m n o p q r s t u v w x y z misc)

# ---------- round-robin letter selection ----------
cursor_file="$WORK/.cursor"
mkdir -p "$WORK"
idx=$(cat "$cursor_file" 2>/dev/null || echo 0)
(( idx = idx % ${#LETTERS[@]} ))
letter="${LETTERS[$idx]}"
echo $(( (idx + 1) % ${#LETTERS[@]} )) > "$cursor_file"

repo_dir="$WORK/repos/recipes-$letter"
if [[ ! -d "$repo_dir/.git" ]]; then
  echo "ERROR: $repo_dir not cloned. Run bootstrap.sh first." >&2
  exit 2
fi
cd "$repo_dir"

# Keep local in sync (someone could push from another machine).
git pull --quiet --rebase --autostash 2>/dev/null || true

# ---------- helper: call ollama with JSON mode ----------
ollama_json() {
  local prompt="$1"
  local body
  body=$(jq -nc --arg m "$MODEL" --arg p "$prompt" \
    '{model: $m, prompt: $p, format: "json", stream: false, options: {temperature: 0.8}}')
  curl -fsS --max-time 300 http://localhost:11434/api/generate -d "$body" \
    | jq -r '.response'
}

# ---------- pick a fresh dish name (up to 3 tries) ----------
name=""; slug=""
for attempt in 1 2 3; do
  if [[ "$letter" == "misc" ]]; then
    nprompt="Invent one real dish name from any cuisine. Be creative — include fusion, regional specialties, or lesser-known dishes. Return JSON: {\"name\": string, \"cuisine\": string}. ONLY JSON."
  else
    nprompt="Invent one real dish whose name starts with the letter '${letter}'. Include fusion, regional, or lesser-known dishes. Return JSON: {\"name\": string, \"cuisine\": string}. ONLY JSON. Name MUST start with '${letter}'."
  fi
  raw=$(ollama_json "$nprompt") || continue
  candidate=$(jq -r '.name // empty' <<<"$raw" 2>/dev/null || true)
  [[ -z "$candidate" ]] && continue
  cand_slug=$(echo "$candidate" | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9]\+/-/g; s/^-\+//; s/-\+$//')
  [[ -z "$cand_slug" ]] && continue
  # Letter enforcement (misc accepts any)
  if [[ "$letter" != "misc" && "${cand_slug:0:1}" != "$letter" ]]; then
    continue
  fi
  # Skip duplicates we've already generated
  if [[ -f "recipes/$cand_slug.json" ]]; then
    continue
  fi
  name="$candidate"; slug="$cand_slug"
  break
done

if [[ -z "$slug" ]]; then
  echo "[$letter] no fresh dish after 3 tries, skipping this tick"
  exit 0
fi

echo "[$letter] generating: $name ($slug)"

# ---------- generate the full recipe ----------
recipe_prompt=$(cat <<EOF
Generate a complete realistic recipe for "$name".
Return ONLY valid JSON matching this exact shape — no markdown, no commentary:
{
  "title": string,
  "description": string (1-2 sentences),
  "cuisine": string | null,
  "diet": string[] | null,
  "meal": "breakfast"|"lunch"|"dinner"|"snack"|"dessert"|null,
  "ingredients": [{"name": string, "amount": string, "notes": string?}],
  "instructions": string[],
  "prepTimeMin": number,
  "cookTimeMin": number,
  "totalTimeMin": number,
  "servings": number,
  "difficulty": "easy"|"medium"|"hard",
  "tags": string[] (lowercase, kebab-case),
  "nutrition": {"calories": number, "protein": number, "carbs": number, "fat": number}
}
Rules: realistic quantities, safe cooking temps, 4-12 ingredients, 4-12 steps.
EOF
)

recipe_raw=$(ollama_json "$recipe_prompt") || {
  echo "[$letter] ollama failed for $slug"; exit 1;
}

# Enrich with metadata + validate shape
now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
enriched=$(jq --arg slug "$slug" \
              --arg now "$now" \
              --arg model "$MODEL" '
  . + {
    slug: $slug,
    source: $model,
    canonicalUrl: ("https://foodrecipes.page/r/" + $slug),
    providerUsed: ("ollama-" + $model),
    createdAt: $now
  }
' <<<"$recipe_raw" 2>/dev/null) || {
  echo "[$letter] bad JSON for $slug"; exit 1;
}

if ! jq -e '(.title|type=="string") and (.ingredients|type=="array") and (.instructions|type=="array") and (.ingredients|length>0) and (.instructions|length>0)' \
     >/dev/null <<<"$enriched"; then
  echo "[$letter] invalid recipe shape for $slug"; exit 1
fi

mkdir -p recipes
jq '.' <<<"$enriched" > "recipes/$slug.json"

# ---------- update index.json (array of entries) ----------
if ! jq -e 'type=="array"' index.json >/dev/null 2>&1; then
  echo "[]" > index.json
fi
entry=$(jq --arg letter "$letter" \
  '{slug, title, tags: (.tags // []), cuisine, totalTimeMin, shard: $letter}' \
  <<<"$enriched")
tmp=$(mktemp)
jq --argjson e "$entry" '
  map(select(.slug != $e.slug)) + [$e] | sort_by(.slug)
' index.json > "$tmp"
mv "$tmp" index.json

# ---------- commit & push ----------
git add recipes/ index.json
git commit --quiet -m "recipe: $slug"
# Retry push up to 3x (handles rare concurrent pushes from other workers)
for try in 1 2 3; do
  if git push --quiet origin main 2>/dev/null; then
    break
  fi
  git pull --quiet --rebase --autostash || true
  sleep $(( try * 2 ))
done

# ---------- purge jsDelivr so the new file appears in seconds ----------
(curl -fsS -m 10 "https://purge.jsdelivr.net/gh/$ORG/recipes-$letter@main/recipes/$slug.json" >/dev/null &)
(curl -fsS -m 10 "https://purge.jsdelivr.net/gh/$ORG/recipes-$letter@main/index.json" >/dev/null &)

echo "[$letter] OK $slug"
