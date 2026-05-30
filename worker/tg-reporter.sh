#!/usr/bin/env bash
# tg-reporter.sh — consolidated Telegram status report every REPORT_INTERVAL.
#
# Reads each worker's $HOME/frp-state-${LABEL}.json (last_window_* fields are
# refreshed by forever.sh on the same cadence), counts recipes on disk per
# shard, samples free RAM, and posts ONE Telegram message every 15 minutes.
#
# Also posts a startup ping with all enabled workers, and surfaces any active
# cooldown files (~/.frp-cooldown-X) so you see when a cloud provider is
# parked vs. actually generating.
#
# Env (mostly inherited from .frp.env):
#   TG_BOT_TOKEN, TG_CHAT_ID  (required, otherwise script no-ops)
#   REPORT_INTERVAL   default 900   (seconds; 15 min)
#   WORK              default $HOME/frp-shards
#   TARGET_RECIPES    default 25000  (used in ETA line)
#   WORKERS           default "A B C D"  (which labels to read)

set -uo pipefail

WORK="${WORK:-$HOME/frp-shards}"
REPORT_INTERVAL="${REPORT_INTERVAL:-900}"
TARGET_RECIPES="${TARGET_RECIPES:-25000}"
WORKERS=(${WORKERS:-A B C D})
LETTERS=(a b c d e f g h i j k l m n o p q r s t u v w x y z misc)

mkdir -p "$WORK"
exec 9>"$WORK/.tg-reporter.lock"
flock -n 9 || { echo "another tg-reporter running, exiting"; exit 0; }

for bin in jq curl awk; do
  command -v "$bin" >/dev/null || { echo "missing dep: $bin"; exit 2; }
done

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

total_recipes() {
  local total=0 L n
  for L in "${LETTERS[@]}"; do
    [[ -d "$WORK/repos/recipes-$L/recipes" ]] || continue
    n=$(find "$WORK/repos/recipes-$L/recipes" -maxdepth 1 -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
    total=$(( total + n ))
  done
  echo "$total"
}

mem_free_mb() {
  awk '/^MemAvailable:/ {print int($2/1024); exit}' /proc/meminfo 2>/dev/null || echo "?"
}

mem_total_mb() {
  awk '/^MemTotal:/ {print int($2/1024); exit}' /proc/meminfo 2>/dev/null || echo "?"
}

mem_used_mb() {
  # Approximation: total - available (matches `free` "used" closely)
  awk '/^MemTotal:/ {t=$2} /^MemAvailable:/ {a=$2} END{if(t&&a) print int((t-a)/1024); else print "?"}' /proc/meminfo 2>/dev/null
}

swap_used_mb() {
  awk '/^SwapTotal:/ {t=$2} /^SwapFree:/ {f=$2} END{if(t) print int((t-f)/1024); else print 0}' /proc/meminfo 2>/dev/null
}

swap_total_mb() {
  awk '/^SwapTotal:/ {print int($2/1024); exit}' /proc/meminfo 2>/dev/null || echo 0
}

load_avg() {
  awk '{print $1" / "$2" / "$3}' /proc/loadavg 2>/dev/null || echo "?"
}

# CPU package temperature in °C. Prefer x86_pkg_temp; fall back to the hottest
# thermal_zone we can read. Returns "?" if nothing found.
cpu_temp_c() {
  local t=""
  # Preferred: x86 package temp
  for z in /sys/class/thermal/thermal_zone*; do
    [[ -r "$z/type" && -r "$z/temp" ]] || continue
    if [[ "$(cat "$z/type" 2>/dev/null)" == "x86_pkg_temp" ]]; then
      t=$(cat "$z/temp" 2>/dev/null)
      break
    fi
  done
  # Fallback: hottest plausible zone (between 20°C and 110°C)
  if [[ -z "$t" ]]; then
    local hi=0 v
    for z in /sys/class/thermal/thermal_zone*; do
      [[ -r "$z/temp" ]] || continue
      v=$(cat "$z/temp" 2>/dev/null)
      [[ "$v" =~ ^[0-9]+$ ]] || continue
      # ignore wildly low readings (INT3400 etc reads 20000 = 20°C)
      (( v > hi && v < 110000 )) && hi=$v
    done
    (( hi > 0 )) && t=$hi
  fi
  [[ -z "$t" ]] && { echo "?"; return; }
  awk -v t="$t" 'BEGIN{printf "%.0f", t/1000}'
}

cpu_throttle_count() {
  # If x86_pkg_temp has a trip point at 100°C, count throttle events.
  # Otherwise empty. Best-effort.
  awk '{print $1}' /proc/stat 2>/dev/null >/dev/null
  echo ""
}

worker_block() {
  local L="$1"
  local sf="$HOME/frp-state-${L}.json"
  local cf="$HOME/.frp-cooldown-${L}"
  local backend="?" model="?"
  local ok=0 fail=0 skip=0 secs=0

  if [[ -f "$sf" ]]; then
    ok=$(jq -r '.last_window_ok      // 0' "$sf" 2>/dev/null)
    fail=$(jq -r '.last_window_fail   // 0' "$sf" 2>/dev/null)
    skip=$(jq -r '.last_window_skipped // 0' "$sf" 2>/dev/null)
    secs=$(jq -r '.last_window_secs   // 0' "$sf" 2>/dev/null)
  fi

  case "$L" in
    A) backend="ollama"; model="${MODEL:-qwen2.5:3b}" ;;
    B) backend="groq";   model="${GROQ_MODEL:-llama-3.1-8b-instant}" ;;
    C) backend="nvidia"; model="${NVIDIA_MODEL:-meta/llama-3.3-70b-instruct}" ;;
    D) backend="ocloud"; model="${OCLOUD_MODEL:-gpt-oss:20b}" ;;
  esac

  local cd_str=""
  if [[ -f "$cf" ]]; then
    local until_ts=$(cat "$cf" | tr -dc 0-9)
    local now=$(date +%s)
    local remain=$(( until_ts - now ))
    if (( remain > 0 )); then
      cd_str=" ❄️cooldown $((remain/60))m"
    fi
  fi

  local rate=""
  if (( secs > 0 && ok > 0 )); then
    # ok/min
    rate=$(awk -v ok="$ok" -v s="$secs" 'BEGIN{printf "%.1f", ok*60/s}')
    rate=" (${rate}/min)"
  fi

  printf '  %s %-7s %-32s OK %3d · FAIL %2d · SKIP %2d%s%s\n' \
    "$L" "$backend" "$model" "$ok" "$fail" "$skip" "$rate" "$cd_str"
}

send_report() {
  local now total mem_a mem_t mem_u swap_u swap_t load temp
  now=$(date '+%F %T %Z')
  total=$(total_recipes)
  mem_a=$(mem_free_mb); mem_t=$(mem_total_mb); mem_u=$(mem_used_mb)
  swap_u=$(swap_used_mb); swap_t=$(swap_total_mb)
  load=$(load_avg)
  temp=$(cpu_temp_c)
  local lines=""
  local total_ok=0
  for L in "${WORKERS[@]}"; do
    lines+="$(worker_block "$L")"$'\n'
    local sf="$HOME/frp-state-${L}.json"
    [[ -f "$sf" ]] && total_ok=$(( total_ok + $(jq -r '.last_window_ok // 0' "$sf" 2>/dev/null || echo 0) ))
  done

  # ETA
  local eta="" eta_days per_day
  if (( total_ok > 0 )); then
    per_day=$(( total_ok * 86400 / REPORT_INTERVAL ))
    local remaining=$(( TARGET_RECIPES - total ))
    if (( remaining > 0 && per_day > 0 )); then
      eta_days=$(awk -v r="$remaining" -v p="$per_day" 'BEGIN{printf "%.1f", r/p}')
      eta="*ETA to ${TARGET_RECIPES}:* ${eta_days} days  (~${per_day}/day)"
    elif (( remaining <= 0 )); then
      eta="🎯 *Target ${TARGET_RECIPES} reached*"
    fi
  fi

  # RAM warning marker
  local ram_warn=""
  if [[ "$mem_a" =~ ^[0-9]+$ ]] && (( mem_a < 500 )); then
    ram_warn=" ⚠️LOW"
  fi
  local swap_warn=""
  if [[ "$swap_u" =~ ^[0-9]+$ ]] && (( swap_u > 100 )); then
    swap_warn=" ⚠️SWAPPING"
  fi
  # CPU heat warning: 85°C ≈ hot, 95°C ≈ throttling territory
  local temp_warn=""
  if [[ "$temp" =~ ^[0-9]+$ ]]; then
    if   (( temp >= 95 )); then temp_warn=" 🔥CRITICAL"
    elif (( temp >= 85 )); then temp_warn=" ⚠️HOT"
    fi
  fi

  # Cooldown summary across all workers — surfaced at the top so it's the
  # first thing visible in the Telegram message.
  local cooldown_summary=""
  local cd_lines=""
  for L in "${WORKERS[@]}"; do
    local cf="$HOME/.frp-cooldown-${L}"
    [[ -f "$cf" ]] || continue
    local until_ts now remain backend
    until_ts=$(cat "$cf" 2>/dev/null | tr -dc 0-9)
    [[ -z "$until_ts" ]] && continue
    now=$(date +%s)
    remain=$(( until_ts - now ))
    (( remain <= 0 )) && continue
    case "$L" in
      A) backend="ollama" ;;
      B) backend="groq"   ;;
      C) backend="nvidia" ;;
      D) backend="ocloud" ;;
      *) backend="?"      ;;
    esac
    local human
    if (( remain >= 3600 )); then
      human="$((remain/3600))h$(( (remain%3600)/60 ))m"
    elif (( remain >= 60 )); then
      human="$((remain/60))m$((remain%60))s"
    else
      human="${remain}s"
    fi
    cd_lines+="  • $L $backend — resumes in $human$(date -d "@$until_ts" '+ (at %H:%M)' 2>/dev/null)"$'\n'
  done
  if [[ -n "$cd_lines" ]]; then
    cooldown_summary="
❄️ *APIs in cooldown:*
$cd_lines"
  fi

  tg_send "🍳 *foodrecipes.page* — \`$(hostname)\`
$now
$cooldown_summary
*Total on disk:* $total / $TARGET_RECIPES   ($(( total * 100 / (TARGET_RECIPES > 0 ? TARGET_RECIPES : 1) ))%)
*Last $((REPORT_INTERVAL/60)) min:* OK $total_ok across all workers
$eta

*RAM:* used ${mem_u} MB · free ${mem_a} MB · total ${mem_t} MB${ram_warn}
*Swap:* ${swap_u} / ${swap_t} MB${swap_warn}
*CPU temp:* ${temp}°C${temp_warn}
*Load:* ${load}

\`\`\`
$lines\`\`\`"
}

# Startup ping
tg_send "🟢 *frp stack started* — \`$(hostname)\`
$(date '+%F %T %Z')
target: ${TARGET_RECIPES} recipes
report every $((REPORT_INTERVAL/60)) min"

trap 'tg_send "🔴 tg-reporter stopped on \`$(hostname)\` at $(date +%T)"; exit 0' INT TERM

# Wait for the first interval, then loop. Close the lock fd before sleeping
# so a SIGKILL of bash doesn't leave an orphan `sleep` holding the lock.
while :; do
  ( exec 9<&- ; sleep "$REPORT_INTERVAL" )
  send_report
done
