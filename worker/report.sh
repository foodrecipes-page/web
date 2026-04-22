#!/usr/bin/env bash
# Daily/periodic progress report for the foodrecipes.page recipe worker.
# Counts recipes in local shard clones and sends a Telegram message.
#
# Env required:
#   TG_BOT_TOKEN — from @BotFather
#   TG_CHAT_ID   — your personal chat id (from @userinfobot)
# Optional:
#   WORK         — default $HOME/frp-shards
#   HOSTNAME_TAG — default `hostname`
#
# Invoked by the systemd --user timer (frp-report.timer), 3x daily.

set -euo pipefail

WORK="${WORK:-$HOME/frp-shards}"
TAG="${HOSTNAME_TAG:-$(hostname)}"
STATE="$WORK/.report-state"

: "${TG_BOT_TOKEN:?TG_BOT_TOKEN env var required}"
: "${TG_CHAT_ID:?TG_CHAT_ID env var required}"

LETTERS=(a b c d e f g h i j k l m n o p q r s t u v w x y z misc)

total=0
lines=""
for L in "${LETTERS[@]}"; do
  dir="$WORK/repos/recipes-$L/recipes"
  n=0
  if [[ -d "$dir" ]]; then
    n=$(find "$dir" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
  fi
  total=$(( total + n ))
  # Only show letters with content to keep messages short
  if (( n > 0 )); then
    lines+=$(printf "  %-4s %4d\n" "$L" "$n")
  fi
done

# Delta vs last report
prev=$(cat "$STATE" 2>/dev/null || echo 0)
delta=$(( total - prev ))
echo "$total" > "$STATE"

# Disk + uptime snippets
disk=$(df -h "$WORK" 2>/dev/null | awk 'NR==2 {print $4 " free of " $2}')
up=$(uptime -p 2>/dev/null || uptime)
load=$(awk '{print $1", "$2", "$3}' /proc/loadavg 2>/dev/null || echo "n/a")
ollama_ok="down"
if curl -fsS --max-time 3 http://localhost:11434/api/tags >/dev/null 2>&1; then
  ollama_ok="up"
fi

# Build message (Markdown, kept well under 4096 char limit)
now=$(date '+%Y-%m-%d %H:%M %Z')
read -r -d '' MSG <<EOF || true
🍳 *foodrecipes.page worker* — \`$TAG\`
$now

*Total recipes:* $total  (+$delta since last report)
*Ollama:* $ollama_ok   *Disk:* $disk
*Load:* $load   *$up*

*Per-letter counts* (non-empty only):
\`\`\`
$lines\`\`\`
EOF

curl -fsS --max-time 15 \
  -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TG_CHAT_ID}" \
  --data-urlencode "parse_mode=Markdown" \
  --data-urlencode "text=${MSG}" \
  -o /dev/null \
  && echo "report sent ($total recipes, +$delta)" \
  || { echo "telegram send failed" >&2; exit 1; }
