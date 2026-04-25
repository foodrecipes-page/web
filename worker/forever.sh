#!/usr/bin/env bash
# forever.sh — single never-ending recipe generation loop.
#
# What it does (on loop, forever):
#   1. Pick a random (cuisine × flavor × texture × mood × technique × ingredient)
#      combination from ontology.json.
#   2. Ask Ollama for a dish matching that combo.
#   3. Ask Ollama for the full recipe JSON.
#   4. Write to the right shard repo, commit, push via SSH.
#   5. Every hour, post a summary to Telegram.
#
# Design goals:
#   - ONE file, no n8n, no systemd timer, no cron. Just `bash forever.sh`.
#   - Idempotent & crash-safe: state on disk (`~/frp-state.json`).
#   - Memory-gentle: bails out if MemAvailable < 500 MB.
#   - Polite pacing: configurable sleep between ticks.
#
# Env required:
#   GH_ORG         default foodrecipes-page
#   WORK           default $HOME/frp-shards     (clones live here)
#   ONTOLOGY       default $WORK/ontology.json  (copied here by you)
#   MODEL          default qwen2.5:3b
#   OLLAMA_URL     default http://localhost:11434
#   TG_BOT_TOKEN   (optional — skip if unset)
#   TG_CHAT_ID     (optional)
#   LOOP_SLEEP     default 10  (seconds between successful ticks)
#
# Usage:
#   # Foreground (ctrl-c to stop):
#   bash forever.sh
#
#   # Detached (survives logout):
#   nohup bash forever.sh >> ~/forever.log 2>&1 &
#   disown

set -uo pipefail  # NOT -e: we WANT the loop to keep going on errors

GH_ORG="${GH_ORG:-foodrecipes-page}"
WORK="${WORK:-$HOME/frp-shards}"
ONTOLOGY="${ONTOLOGY:-$WORK/ontology.json}"
MODEL="${MODEL:-qwen2.5:3b}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
LOOP_SLEEP="${LOOP_SLEEP:-10}"
STATE_FILE="$HOME/frp-state.json"

LETTERS=(a b c d e f g h i j k l m n o p q r s t u v w x y z misc)

# ---------- single-instance lock ----------
mkdir -p "$WORK"
exec 9>"$WORK/.forever.lock"
if ! flock -n 9; then
  echo "[$(date '+%F %T')] another forever.sh is running, exiting"
  exit 0
fi

# ---------- sanity ----------
for bin in jq curl git ollama; do
  command -v "$bin" >/dev/null || { echo "missing dependency: $bin"; exit 2; }
done
[[ -f "$ONTOLOGY" ]] || { echo "ontology not found: $ONTOLOGY"; exit 2; }

# ---------- state helpers ----------
state_read() {
  # Print JSON; fresh start if missing/corrupt.
  if [[ -f "$STATE_FILE" ]] && jq empty "$STATE_FILE" 2>/dev/null; then
    cat "$STATE_FILE"
  else
    echo '{"hourly_mark": 0, "ok": 0, "fail": 0, "skipped": 0, "started_at": 0, "last_report": 0}'
  fi
}
state_write() { echo "$1" > "$STATE_FILE.tmp" && mv -f "$STATE_FILE.tmp" "$STATE_FILE"; }
state_bump()  {
  local field="$1"
  local delta="${2:-1}"
  local s; s=$(state_read)
  state_write "$(jq --arg f "$field" --argjson d "$delta" '.[$f] = (.[$f] // 0) + $d' <<<"$s")"
}

# Initialize started_at and hourly_mark if brand new.
now_ts=$(date +%s)
state=$(state_read)
if [[ "$(jq -r '.started_at' <<<"$state")" == "0" ]]; then
  state=$(jq --argjson n "$now_ts" '.started_at = $n | .hourly_mark = $n' <<<"$state")
  state_write "$state"
fi

# ---------- helpers ----------
tg_send() {
  [[ -z "${TG_BOT_TOKEN:-}" || -z "${TG_CHAT_ID:-}" ]] && return 0
  curl -fsS --max-time 15 \
    -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT_ID}" \
    --data-urlencode "parse_mode=Markdown" \
    --data-urlencode "text=$1" \
    -o /dev/null 2>/dev/null \
    || true
}

# Pick one random element from a JSON array at a given jq path.
pick_one() {
  jq -r "$1 | if type == \"array\" then .[] else . end" "$ONTOLOGY" 2>/dev/null \
    | shuf -n 1
}

# Ollama JSON-mode call. $1 = prompt. Prints JSON (or empty on failure).
ollama_json() {
  local body
  body=$(jq -nc --arg m "$MODEL" --arg p "$1" \
    '{model: $m, prompt: $p, format: "json", stream: false, options: {temperature: 0.8, num_ctx: 2048}}')
  curl -fsS --max-time 600 "$OLLAMA_URL/api/generate" \
    -H 'Content-Type: application/json' -d "$body" 2>/dev/null \
    | jq -r '.response // empty' 2>/dev/null
}

slugify() {
  # 1. ASCII-fold (é→e, ñ→n, etc.) — //TRANSLIT may fail on rare glyphs, fall back to IGNORE.
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

# Slug is "good" if it has at least 2 hyphen-separated segments and >= 6 chars.
slug_ok() {
  local s="$1"
  [[ -n "$s" ]] || return 1
  [[ ${#s} -ge 6 ]] || return 1
  [[ "$s" == *-* ]] || return 1
  return 0
}

# ---------- hourly report ----------
maybe_report() {
  local now=$(date +%s)
  local mark; mark=$(jq -r '.hourly_mark' "$STATE_FILE")
  local elapsed=$(( now - mark ))
  (( elapsed >= 3600 )) || return 0

  # Per-letter counts (local, no API)
  local total=0
  local lines=""
  for L in "${LETTERS[@]}"; do
    local n=0
    [[ -d "$WORK/repos/recipes-$L/recipes" ]] \
      && n=$(find "$WORK/repos/recipes-$L/recipes" -maxdepth 1 -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
    total=$(( total + n ))
    (( n > 0 )) && lines+="$(printf '  %-4s %4d\n' "$L" "$n")"
  done

  local s; s=$(state_read)
  local ok=$(jq -r '.ok'      <<<"$s")
  local fail=$(jq -r '.fail'  <<<"$s")
  local skip=$(jq -r '.skipped' <<<"$s")
  local start=$(jq -r '.started_at' <<<"$s")
  local up_min=$(( (now - start) / 60 ))
  local free_mb; free_mb=$(awk '/^MemAvailable:/ {print int($2/1024); exit}' /proc/meminfo 2>/dev/null || echo "?")
  local host; host=$(hostname)

  tg_send "🍳 *forever.sh* — \`$host\`
$(date '+%F %T %Z')

*Total recipes on disk:* $total
*This hour:* OK $ok · FAIL $fail · SKIP $skip
*Uptime:* ${up_min} min   *Free RAM:* ${free_mb} MB

\`\`\`
$lines\`\`\`"

  # Reset hourly counters and advance the mark.
  state_write "$(jq --argjson n "$now" '.hourly_mark = $n | .ok = 0 | .fail = 0 | .skipped = 0 | .last_report = $n' <<<"$s")"
}

# ---------- one tick ----------
do_tick() {
  # Skip if memory is tight.
  local avail_kb; avail_kb=$(awk '/^MemAvailable:/ {print $2; exit}' /proc/meminfo 2>/dev/null || echo 999999999)
  if (( avail_kb < 500000 )); then
    echo "[$(date '+%T')] low RAM ($(( avail_kb / 1024 )) MB) — sleeping 60s"
    state_bump skipped
    sleep 60
    return 0
  fi

  # Pick a combination from the ontology.
  local cuisine flavor texture mood technique ingredient diet region
  cuisine=$(pick_one '.cuisines')
  flavor=$(pick_one '.flavors')
  texture=$(pick_one '.textures')
  mood=$(pick_one '.moods')
  technique=$(pick_one '.techniques')
  ingredient=$(pick_one '.ingredients')
  diet=$(pick_one '.diets')
  # Occasional regional flavor (30%)
  if (( RANDOM % 10 < 3 )) && jq -e --arg c "$cuisine" '.regions[$c] // empty' "$ONTOLOGY" >/dev/null 2>&1; then
    region=$(jq -r --arg c "$cuisine" '.regions[$c][]' "$ONTOLOGY" | shuf -n 1)
  fi

  # Build a natural prompt.
  local combo="$flavor, $texture, $mood $cuisine${region:+ ($region)} dish featuring $ingredient, $technique, $diet-friendly"
  echo "[$(date '+%T')] combo: $combo"

  # 1. Ask for a dish name matching this combo. Retry once if slug is malformed.
  local name_raw name slug attempt=0
  while (( attempt < 2 )); do
    attempt=$(( attempt + 1 ))
    name_raw=$(ollama_json "Give ONE real or plausible dish name (2-6 words) for this brief: $combo.
The name MUST be multiple words separated by spaces (e.g. \"Smoky Lamb Tagine\", \"Indian Spiced Carrot Soup\"). NO single-word names. NO camelCase.
Prefer leading the name with the cuisine adjective (Italian, Indian, Thai, etc.) or the primary ingredient when natural.
Use only plain ASCII letters in the name (no accents).
Return JSON: {\"name\": string}. ONLY JSON.")
    name=$(jq -r '.name // empty' <<<"$name_raw" 2>/dev/null)
    [[ -z "$name" ]] && { echo "  ollama gave no name (attempt $attempt)"; continue; }
    slug=$(slugify "$name")
    if slug_ok "$slug"; then break; fi
    echo "  malformed slug '$slug' from name '$name' (attempt $attempt)"
    slug=""
  done
  if [[ -z "$slug" ]]; then
    state_bump fail; return 0
  fi

  # Route to shard by first letter of slug.
  local letter="${slug:0:1}"
  [[ "$letter" =~ [a-z] ]] || letter="misc"
  local repo="$WORK/repos/recipes-$letter"
  [[ -d "$repo/.git" ]] || { echo "  missing repo $repo"; state_bump fail; return 0; }

  # Dedup locally (cheap).
  if [[ -f "$repo/recipes/$slug.json" ]]; then
    echo "  dup: $slug"; state_bump skipped; return 0
  fi

  # 2. Full recipe.
  local recipe_raw recipe
  recipe_raw=$(ollama_json "Generate a complete realistic recipe for \"$name\" (brief: $combo).
Return ONLY valid JSON matching this shape — no markdown, no commentary:
{
  \"title\": string,
  \"description\": string (1-2 sentences),
  \"cuisine\": string,
  \"diet\": string[] | null,
  \"meal\": \"breakfast\"|\"lunch\"|\"dinner\"|\"snack\"|\"dessert\",
  \"ingredients\": [{\"name\": string, \"amount\": string, \"notes\": string?}],
  \"instructions\": string[],
  \"prepTimeMin\": number,
  \"cookTimeMin\": number,
  \"totalTimeMin\": number,
  \"servings\": number,
  \"difficulty\": \"easy\"|\"medium\"|\"hard\",
  \"tags\": string[] (lowercase, kebab-case),
  \"nutrition\": {\"calories\": number, \"protein\": number, \"carbs\": number, \"fat\": number}
}
Rules: realistic quantities, safe cooking temps, 4-12 ingredients, 4-12 steps.")

  # Validate shape.
  if ! jq -e '(.title|type=="string") and (.ingredients|type=="array") and (.instructions|type=="array") and (.ingredients|length>0) and (.instructions|length>0)' \
       >/dev/null 2>&1 <<<"$recipe_raw"; then
    echo "  invalid recipe shape for $slug"; state_bump fail; return 0
  fi

  # Enrich with metadata + combo fingerprint.
  recipe=$(jq \
    --arg slug "$slug" \
    --arg model "$MODEL" \
    --arg now "$(date -u +%FT%TZ)" \
    --arg flavor "$flavor" --arg texture "$texture" --arg mood "$mood" \
    --arg technique "$technique" --arg ingredient "$ingredient" --arg diet "$diet" \
    --arg region "${region:-}" '
    . + {
      slug: $slug,
      source: ("ollama-" + $model),
      canonicalUrl: ("https://foodrecipes.page/r/" + $slug),
      providerUsed: ("ollama-" + $model),
      createdAt: $now,
      axes: {
        flavor: $flavor, texture: $texture, mood: $mood,
        technique: $technique, primaryIngredient: $ingredient,
        diet: $diet, region: (if $region=="" then null else $region end)
      }
    }' <<<"$recipe_raw")

  # 3. Write + update index.
  mkdir -p "$repo/recipes"
  echo "$recipe" | jq '.' > "$repo/recipes/$slug.json" || { echo "  write failed"; state_bump fail; return 0; }

  # Upsert in index.json
  [[ -f "$repo/index.json" ]] || echo "[]" > "$repo/index.json"
  jq -e 'type == "array"' "$repo/index.json" >/dev/null 2>&1 || echo "[]" > "$repo/index.json"
  local entry
  entry=$(jq --arg L "$letter" '{slug, title, tags: (.tags // []), cuisine, totalTimeMin, shard: $L}' <<<"$recipe")
  jq --argjson e "$entry" '
    map(select(.slug != $e.slug)) + [$e] | sort_by(.slug)
  ' "$repo/index.json" > "$repo/index.json.tmp" && mv -f "$repo/index.json.tmp" "$repo/index.json"

  # 4. Commit + push.
  (
    cd "$repo" \
      && git add recipes/ index.json \
      && git commit --quiet -m "recipe: $slug" \
      && for t in 1 2 3; do
           git push --quiet origin main 2>/dev/null && break
           git pull --quiet --rebase --autostash 2>/dev/null || true
           sleep $(( t * 2 ))
         done
  ) || { echo "  git push failed for $slug"; state_bump fail; return 0; }

  # 5. Purge jsDelivr in background.
  (curl -fsS -m 10 "https://purge.jsdelivr.net/gh/$GH_ORG/recipes-$letter@main/recipes/$slug.json" >/dev/null 2>&1 &)
  (curl -fsS -m 10 "https://purge.jsdelivr.net/gh/$GH_ORG/recipes-$letter@main/index.json"         >/dev/null 2>&1 &)

  echo "[$(date '+%T')] OK $letter/$slug"
  state_bump ok
}

# ---------- announce start ----------
tg_send "🟢 *forever.sh started* — \`$(hostname)\`
$(date '+%F %T %Z')
model: \`$MODEL\`
ontology: \`$(jq -r '.ingredients | length' "$ONTOLOGY") ingredients · $(jq -r '.cuisines | length' "$ONTOLOGY") cuisines\`
loop sleep: ${LOOP_SLEEP}s"

# ---------- main loop ----------
trap 'tg_send "🔴 forever.sh *stopped* on \`$(hostname)\` at $(date +%T)"; exit' INT TERM

while :; do
  do_tick || true
  maybe_report || true
  sleep "$LOOP_SLEEP"
done
