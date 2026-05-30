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
LLM_BACKEND="${LLM_BACKEND:-ollama}"           # ollama | groq
WORKER_LABEL="${WORKER_LABEL:-A}"               # short tag for logs/state
MODEL="${MODEL:-qwen2.5:3b}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
GROQ_URL="${GROQ_URL:-https://api.groq.com/openai/v1/chat/completions}"
GROQ_MODEL="${GROQ_MODEL:-llama-3.3-70b-versatile}"
NVIDIA_URL="${NVIDIA_URL:-https://integrate.api.nvidia.com/v1/chat/completions}"
NVIDIA_MODEL="${NVIDIA_MODEL:-meta/llama-3.3-70b-instruct}"
OCLOUD_URL="${OCLOUD_URL:-https://ollama.com/api/chat}"
OCLOUD_MODEL="${OCLOUD_MODEL:-gpt-oss:20b}"
LOOP_SLEEP="${LOOP_SLEEP:-10}"
STATE_FILE="${STATE_FILE:-$HOME/frp-state-${WORKER_LABEL}.json}"
LOCK_FILE="${LOCK_FILE:-$WORK/.forever-${WORKER_LABEL}.lock}"

LETTERS=(a b c d e f g h i j k l m n o p q r s t u v w x y z misc)

# ---------- single-instance lock (per worker label) ----------
mkdir -p "$WORK"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(date '+%F %T')] another forever.sh ($WORKER_LABEL) is running, exiting"
  exit 0
fi

# ---------- sanity ----------
for bin in jq curl git; do
  command -v "$bin" >/dev/null || { echo "missing dependency: $bin"; exit 2; }
done
if [[ "$LLM_BACKEND" == "ollama" ]]; then
  command -v ollama >/dev/null || { echo "missing dependency: ollama"; exit 2; }
elif [[ "$LLM_BACKEND" == "groq" ]]; then
  [[ -n "${GROQ_API_KEY:-}" ]] || { echo "GROQ_API_KEY not set"; exit 2; }
elif [[ "$LLM_BACKEND" == "nvidia" ]]; then
  [[ -n "${NVIDIA_API_KEY:-}" ]] || { echo "NVIDIA_API_KEY not set"; exit 2; }
elif [[ "$LLM_BACKEND" == "ocloud" ]]; then
  [[ -n "${OCLOUD_API_KEY:-}" ]] || { echo "OCLOUD_API_KEY not set"; exit 2; }
else
  echo "unknown LLM_BACKEND=$LLM_BACKEND"; exit 2
fi
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
# is_fresh_start is true only the very first run (used to gate the
# Telegram "started" announcement so supervisor restarts stay quiet).
now_ts=$(date +%s)
state=$(state_read)
is_fresh_start=0
if [[ "$(jq -r '.started_at' <<<"$state")" == "0" ]]; then
  state=$(jq --argjson n "$now_ts" '.started_at = $n | .hourly_mark = $n' <<<"$state")
  state_write "$state"
  is_fresh_start=1
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

# ---------- cloud cooldown (429 budget exhausted) ----------
# When a provider rate-limits us with a long retry hint (e.g. "try again in
# 12.96s" or daily-quota-style messages), we persist resume_at_epoch to a
# per-worker file. Subsequent ticks block on it until expiry rather than
# burning the loop. After expiry the file is removed.
COOLDOWN_FILE="$HOME/.frp-cooldown-${WORKER_LABEL}"

cooldown_active_secs() {
  # echoes positive seconds remaining if cooldown active, else echoes 0.
  [[ -f "$COOLDOWN_FILE" ]] || { echo 0; return 0; }
  local until_ts now remain
  until_ts=$(cat "$COOLDOWN_FILE" 2>/dev/null | tr -dc 0-9)
  [[ -z "$until_ts" ]] && { echo 0; return 0; }
  now=$(date +%s)
  remain=$(( until_ts - now ))
  if (( remain <= 0 )); then
    rm -f "$COOLDOWN_FILE"
    echo 0
  else
    echo "$remain"
  fi
}

set_cooldown() {
  # $1 = seconds to wait. Writes resume epoch.
  local s="$1"
  [[ -z "$s" || "$s" -le 0 ]] && return 0
  echo "$(( $(date +%s) + s ))" > "$COOLDOWN_FILE"
  echo "  [$WORKER_LABEL] cooldown: $s seconds (until $(date -d @$(cat $COOLDOWN_FILE) '+%T' 2>/dev/null || cat $COOLDOWN_FILE))" >&2
}

# Parse a Groq/OpenAI-style 429 body or Retry-After header into seconds.
# Returns sane default (60) if nothing extractable, capped at 24h.
parse_retry_seconds() {
  local body="$1" header_secs="${2:-}"
  # 1. explicit Retry-After header (seconds)
  if [[ -n "$header_secs" && "$header_secs" =~ ^[0-9]+$ ]]; then
    (( header_secs > 86400 )) && header_secs=86400
    echo "$header_secs"; return 0
  fi
  # 2. "Please try again in 12.96s" / "in 1m23s" / "in 3h"
  local s
  s=$(printf '%s' "$body" | grep -oE 'try again in [0-9]+m?[0-9]*\.?[0-9]*[smh]?' | head -1)
  if [[ -n "$s" ]]; then
    # crude: extract first number, treat "h" as 3600, "m" as 60, default seconds.
    local n unit
    n=$(printf '%s' "$s" | grep -oE '[0-9]+\.?[0-9]*' | head -1)
    unit=$(printf '%s' "$s" | grep -oE '[smh]' | head -1)
    n=${n%.*}                  # drop fractional
    [[ -z "$n" ]] && n=60
    case "$unit" in
      h) echo $(( n * 3600 )); return 0 ;;
      m) echo $(( n * 60 ));   return 0 ;;
      *) echo "$n";            return 0 ;;
    esac
  fi
  # 3. Daily/TPD exhaustion → cool 1h
  if printf '%s' "$body" | grep -qiE 'tokens per day|requests per day|daily|TPD|RPD'; then
    echo 3600; return 0
  fi
  # 4. Default
  echo 60
}

# Ollama JSON-mode call. $1 = prompt. Prints JSON (or empty on failure).
# think:false disables qwen3's reasoning tokens (otherwise .response is empty).
ollama_json() {
  local body
  body=$(jq -nc --arg m "$MODEL" --arg p "$1" \
    '{model: $m, prompt: $p, format: "json", stream: false, think: false, options: {temperature: 0.8, num_ctx: 2048}}')
  curl -fsS --max-time 600 "$OLLAMA_URL/api/generate" \
    -H 'Content-Type: application/json' -d "$body" 2>/dev/null \
    | jq -r '.response // empty' 2>/dev/null
}

# Groq JSON-mode call (OpenAI-compatible). On 429 we parse the retry hint and
# park the cooldown file so we don't burn the loop spinning.
groq_json() {
  local body resp http_code retry_after secs
  body=$(jq -nc --arg m "$GROQ_MODEL" --arg p "$1" \
    '{model: $m, temperature: 0.8, response_format: {type: "json_object"},
      messages: [{role: "user", content: $p}]}')
  # Capture headers + body + status.
  local tmp_h; tmp_h=$(mktemp)
  resp=$(curl -sS --max-time 60 -D "$tmp_h" -w '\n__HTTP__%{http_code}' "$GROQ_URL" \
    -H "Authorization: Bearer ${GROQ_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d "$body" 2>/dev/null)
  local rc=$?
  http_code=$(printf '%s' "$resp" | awk -F'__HTTP__' 'END{print $2}')
  resp=$(printf '%s' "$resp" | sed 's/__HTTP__[0-9]*$//')
  retry_after=$(grep -i '^retry-after:' "$tmp_h" 2>/dev/null | tr -d '\r' | awk '{print $2}' | head -1)
  rm -f "$tmp_h"
  if (( rc != 0 )) && [[ -z "$http_code" ]]; then sleep 5; return 0; fi
  if [[ "$http_code" == "429" ]]; then
    secs=$(parse_retry_seconds "$resp" "$retry_after")
    # Floor at 10s for Groq — sub-second retry-after often understates the
    # real TPM bucket and we just thrash. Cap at the parsed value otherwise.
    (( secs < 10 )) && secs=10
    set_cooldown "$secs"
    return 0
  fi
  if [[ "$http_code" != "200" ]]; then
    echo "  groq HTTP $http_code" >&2
    [[ "$http_code" =~ ^5 ]] && set_cooldown 30
    sleep 3
    return 0
  fi
  jq -r '.choices[0].message.content // empty' <<<"$resp" 2>/dev/null
}

# NVIDIA NIM (build.nvidia.com) — OpenAI-compatible.
nvidia_json() {
  local body resp http_code retry_after secs
  body=$(jq -nc --arg m "$NVIDIA_MODEL" --arg p "$1" \
    '{model: $m, temperature: 0.8, max_tokens: 2048,
      messages: [{role: "user", content: ($p + "\n\nReturn ONLY a single JSON object — no prose, no markdown fences.")}]}')
  local tmp_h; tmp_h=$(mktemp)
  resp=$(curl -sS --max-time 90 -D "$tmp_h" -w '\n__HTTP__%{http_code}' "$NVIDIA_URL" \
    -H "Authorization: Bearer ${NVIDIA_API_KEY}" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json' \
    -d "$body" 2>/dev/null)
  local rc=$?
  http_code=$(printf '%s' "$resp" | awk -F'__HTTP__' 'END{print $2}')
  resp=$(printf '%s' "$resp" | sed 's/__HTTP__[0-9]*$//')
  retry_after=$(grep -i '^retry-after:' "$tmp_h" 2>/dev/null | tr -d '\r' | awk '{print $2}' | head -1)
  rm -f "$tmp_h"
  if (( rc != 0 )) && [[ -z "$http_code" ]]; then sleep 5; return 0; fi
  if [[ "$http_code" == "429" ]]; then
    secs=$(parse_retry_seconds "$resp" "$retry_after")
    set_cooldown "$secs"
    return 0
  fi
  if [[ "$http_code" != "200" ]]; then
    echo "  nvidia HTTP $http_code" >&2
    [[ "$http_code" =~ ^5 ]] && set_cooldown 30
    sleep 3
    return 0
  fi
  local content
  content=$(jq -r '.choices[0].message.content // empty' <<<"$resp" 2>/dev/null)
  printf '%s' "$content" | sed -E 's/^[[:space:]]*```[a-zA-Z]*[[:space:]]*//; s/[[:space:]]*```[[:space:]]*$//'
}

# Ollama Cloud (ollama.com/api/chat) — native chat shape with bearer auth.
ocloud_json() {
  local body resp http_code retry_after secs
  body=$(jq -nc --arg m "$OCLOUD_MODEL" --arg p "$1" \
    '{model: $m, stream: false,
      options: {temperature: 0.8},
      messages: [{role: "user", content: ($p + "\n\nReturn ONLY a single JSON object — no prose, no markdown fences.")}]}')
  local tmp_h; tmp_h=$(mktemp)
  resp=$(curl -sS --max-time 120 -D "$tmp_h" -w '\n__HTTP__%{http_code}' "$OCLOUD_URL" \
    -H "Authorization: Bearer ${OCLOUD_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d "$body" 2>/dev/null)
  local rc=$?
  http_code=$(printf '%s' "$resp" | awk -F'__HTTP__' 'END{print $2}')
  resp=$(printf '%s' "$resp" | sed 's/__HTTP__[0-9]*$//')
  retry_after=$(grep -i '^retry-after:' "$tmp_h" 2>/dev/null | tr -d '\r' | awk '{print $2}' | head -1)
  rm -f "$tmp_h"
  if (( rc != 0 )) && [[ -z "$http_code" ]]; then sleep 5; return 0; fi
  if [[ "$http_code" == "429" ]]; then
    secs=$(parse_retry_seconds "$resp" "$retry_after")
    set_cooldown "$secs"
    return 0
  fi
  if [[ "$http_code" != "200" ]]; then
    echo "  ocloud HTTP $http_code" >&2
    [[ "$http_code" =~ ^5 ]] && set_cooldown 30
    sleep 3
    return 0
  fi
  local content
  content=$(jq -r '.message.content // empty' <<<"$resp" 2>/dev/null)
  printf '%s' "$content" | sed -E 's/^[[:space:]]*```[a-zA-Z]*[[:space:]]*//; s/[[:space:]]*```[[:space:]]*$//'
}

# Unified front-door: route by $LLM_BACKEND.
llm_json() {
  case "$LLM_BACKEND" in
    groq)   groq_json   "$1" ;;
    nvidia) nvidia_json "$1" ;;
    ocloud) ocloud_json "$1" ;;
    *)      ollama_json "$1" ;;
  esac
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

# ---------- window roll ----------
# Per-worker counters are read by an external consolidated reporter
# (tg-reporter.sh) every REPORT_INTERVAL seconds. Here we just roll the
# window: when interval elapses, we copy {ok,fail,skipped} into
# {last_window_ok,...} and reset the live counters. Reporter reads the
# last_window_* fields so it always sees a complete bucket.
maybe_report() {
  local now=$(date +%s)
  local mark; mark=$(jq -r '.hourly_mark' "$STATE_FILE")
  local elapsed=$(( now - mark ))
  local interval="${REPORT_INTERVAL:-900}"
  (( elapsed >= interval )) || return 0

  local s; s=$(state_read)
  state_write "$(jq --argjson n "$now" '
    .last_window_ok      = (.ok      // 0) |
    .last_window_fail    = (.fail    // 0) |
    .last_window_skipped = (.skipped // 0) |
    .last_window_secs    = ($n - .hourly_mark) |
    .hourly_mark = $n |
    .ok = 0 | .fail = 0 | .skipped = 0 |
    .last_report = $n' <<<"$s")"
}

# ---------- one tick ----------
do_tick() {
  # Cooldown gate (set by cloud 429 handlers): nap and bail.
  local cd; cd=$(cooldown_active_secs)
  if (( cd > 0 )); then
    local nap=$(( cd > 120 ? 120 : cd ))
    echo "[$(date '+%T')] [$WORKER_LABEL] cooldown active ${cd}s — sleeping ${nap}s"
    state_bump skipped
    sleep "$nap"
    return 0
  fi

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
  # Uses a structured 4-field prompt — empirically gives the best
  # multi-word, ASCII, cuisine-led names with qwen2.5:3b.
  local name_raw name slug="" attempt=0
  local name_extras=""
  while (( attempt < 2 )); do
    attempt=$(( attempt + 1 ))
    name_raw=$(llm_json "For this brief: $combo

Return ONLY JSON with these fields:
{
  \"cuisine_adjective\": string  (e.g. \"Italian\", \"Indian\", \"Zanzibari\", \"Korean\"),
  \"main_ingredient\":   string  (the primary ingredient noun, e.g. \"almonds\", \"lamb\"),
  \"descriptor\":        string  (1-2 adjectives like \"Crispy\", \"Smoky Roasted\"),
  \"dish_form\":         string  (PICK ONE that fits the brief from this list: Soup, Stew, Chowder, Bisque, Broth, Curry, Tagine, Dal, Risotto, Pilaf, Biryani, Paella, Fried-Rice, Noodles, Ramen, Pho, Pasta, Lasagna, Dumplings, Bao, Gyoza, Tacos, Burrito, Quesadilla, Wrap, Sandwich, Slider, Burger, Flatbread, Pizza, Calzone, Toast, Salad, Bowl, Poke, Skewers, Kebabs, Satay, Brochette, Stir-fry, Hash, Skillet, Frittata, Omelette, Quiche, Tart, Galette, Pie, Crumble, Cobbler, Bake, Casserole, Gratin, Confit, Roast, Grill, Ceviche, Carpaccio, Tartare, Terrine, Pate, Mousse, Pudding, Custard, Trifle, Parfait, Cake, Cookies, Bars, Brownies, Muffins, Scones, Pancakes, Waffles, Crepes, Fritters, Croquettes, Empanadas, Samosas, Spring-Rolls, Sushi, Onigiri),
  \"name\":              string  (\"<descriptor> <cuisine_adjective> <main_ingredient> <dish_form>\", 3-6 words)
}
Plain ASCII letters and spaces only — NO accents, NO unicode, NO camelCase, NO glued words.
DO NOT default to Stir-fry or Crumble unless the technique truly demands it — match dish_form to the cuisine and technique.")
    name=$(jq -r '.name // empty' <<<"$name_raw" 2>/dev/null)
    name_extras=$(jq -c '{cuisine_adjective: (.cuisine_adjective//null), main_ingredient: (.main_ingredient//null), descriptor: (.descriptor//null), dish_form: (.dish_form//null)}' <<<"$name_raw" 2>/dev/null)
    # Fallback: if .name is missing but the structured fields are present,
    # synthesize "<descriptor> <cuisine_adjective> <main_ingredient> <dish_form>".
    # 8b-class models often skip the redundant .name field even with json_object.
    if [[ -z "$name" ]] && [[ -n "$name_raw" ]]; then
      local syn_d syn_c syn_i syn_f
      syn_d=$(jq -r '.descriptor // empty'        <<<"$name_raw" 2>/dev/null)
      syn_c=$(jq -r '.cuisine_adjective // empty' <<<"$name_raw" 2>/dev/null)
      syn_i=$(jq -r '.main_ingredient // empty'   <<<"$name_raw" 2>/dev/null)
      syn_f=$(jq -r '.dish_form // empty'         <<<"$name_raw" 2>/dev/null)
      if [[ -n "$syn_c" && -n "$syn_i" && -n "$syn_f" ]]; then
        name="${syn_d:+$syn_d }$syn_c $syn_i $syn_f"
      fi
    fi
    if [[ -z "$name" ]]; then
      # If a cooldown was just set by the cloud handler, this is a soft 429,
      # not a model failure. Bail out without burning the retry slot.
      if (( $(cooldown_active_secs) > 0 )); then
        echo "  $LLM_BACKEND throttled (attempt $attempt) — cooldown active"
        state_bump skipped; return 0
      fi
      echo "  $LLM_BACKEND gave no name (attempt $attempt)"; continue
    fi
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

  # 2. Full recipe (retry once if shape is invalid).
  local recipe_raw recipe recipe_attempt=0 recipe_prompt
  recipe_prompt="Generate a complete realistic recipe for \"$name\" (brief: $combo).
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
Rules: realistic quantities, safe cooking temps, 4-12 ingredients, 4-12 steps."
  while (( recipe_attempt < 2 )); do
    recipe_attempt=$(( recipe_attempt + 1 ))
    recipe_raw=$(llm_json "$recipe_prompt")
    if jq -e '(.title|type=="string") and (.ingredients|type=="array") and (.instructions|type=="array") and (.ingredients|length>0) and (.instructions|length>0)' \
         >/dev/null 2>&1 <<<"$recipe_raw"; then
      break
    fi
    # Same idea here: a fresh cooldown means soft 429, not a bad shape.
    if (( $(cooldown_active_secs) > 0 )); then
      echo "  $LLM_BACKEND throttled mid-recipe — cooldown active"
      state_bump skipped; return 0
    fi
    echo "  invalid recipe shape for $slug (attempt $recipe_attempt)"
    recipe_raw=""
  done
  if [[ -z "$recipe_raw" ]]; then
    state_bump fail; return 0
  fi

  # Enrich with metadata + combo fingerprint.
  local source_tag
  if [[ "$LLM_BACKEND" == "groq" ]]; then source_tag="groq-$GROQ_MODEL"
  elif [[ "$LLM_BACKEND" == "nvidia" ]]; then source_tag="nvidia-$NVIDIA_MODEL"
  elif [[ "$LLM_BACKEND" == "ocloud" ]]; then source_tag="ocloud-$OCLOUD_MODEL"
  else source_tag="ollama-$MODEL"; fi
  recipe=$(jq \
    --arg slug "$slug" \
    --arg src "$source_tag" \
    --arg now "$(date -u +%FT%TZ)" \
    --arg flavor "$flavor" --arg texture "$texture" --arg mood "$mood" \
    --arg technique "$technique" --arg ingredient "$ingredient" --arg diet "$diet" \
    --arg region "${region:-}" \
    --argjson nx "${name_extras:-null}" '
    . + {
      slug: $slug,
      source: $src,
      canonicalUrl: ("https://foodrecipes.page/r/" + $slug),
      providerUsed: $src,
      createdAt: $now,
      axes: {
        flavor: $flavor, texture: $texture, mood: $mood,
        technique: $technique, primaryIngredient: $ingredient,
        diet: $diet, region: (if $region=="" then null else $region end),
        cuisineAdjective: ($nx.cuisine_adjective // null),
        mainIngredient:   ($nx.main_ingredient // null),
        descriptor:       ($nx.descriptor // null),
        dishForm:         ($nx.dish_form // null)
      }
    }' <<<"$recipe_raw")

  # 3. Write recipe + update index, under a per-repo flock.
  #    Git commit/push is handled separately by git-pusher.sh on a fixed
  #    interval — keeps ollama generation fast and amortises pushes.
  mkdir -p "$repo/recipes"
  (
    flock 8
    echo "$recipe" | jq '.' > "$repo/recipes/$slug.json" || exit 1
    [[ -f "$repo/index.json" ]] || echo "[]" > "$repo/index.json"
    jq -e 'type == "array"' "$repo/index.json" >/dev/null 2>&1 || echo "[]" > "$repo/index.json"
    local entry
    entry=$(jq --arg L "$letter" '{slug, title, tags: (.tags // []), cuisine, totalTimeMin, shard: $L}' <<<"$recipe")
    jq --argjson e "$entry" '
      map(select(.slug != $e.slug)) + [$e] | sort_by(.slug)
    ' "$repo/index.json" > "$repo/index.json.tmp" && mv -f "$repo/index.json.tmp" "$repo/index.json"
  ) 8>"$repo/.frp-write.lock" || { echo "  write failed for $slug"; state_bump fail; return 0; }

  echo "[$(date '+%T')] OK $letter/$slug (queued for push)"
  state_bump ok
}

# ---------- announce start (silent — consolidated reporter handles all Telegram) ----------
# (Per-worker banners removed; tg-reporter.sh sends one combined report every 15 min.)

# ---------- main loop ----------
trap 'exit' INT TERM

while :; do
  do_tick || true
  maybe_report || true
  sleep "$LOOP_SLEEP"
done
