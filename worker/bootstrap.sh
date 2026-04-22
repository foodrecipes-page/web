#!/usr/bin/env bash
# One-shot setup for the Lubuntu recipe-generation worker.
# Run as a regular user (NOT root). Will sudo only where needed.
#
# Prerequisites:
#   - Ollama installed and `qwen2.5:3b` pulled (already done)
#   - This repo cloned anywhere on the laptop
# Usage:
#   cd worker && bash bootstrap.sh

set -euo pipefail

ORG="foodrecipes-page"
WORK="$HOME/frp-shards"
LETTERS=(a b c d e f g h i j k l m n o p q r s t u v w x y z misc)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Step 1/6: system packages (jq, curl, git, nodejs)"
sudo apt update -qq
sudo apt install -y -qq git curl jq ca-certificates

if ! command -v node >/dev/null || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
  # NodeSource LTS for n8n
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y -qq nodejs
fi

echo "==> Step 2/6: SSH key"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
KEY=~/.ssh/id_ed25519_frp
if [[ ! -f "$KEY" ]]; then
  ssh-keygen -t ed25519 -f "$KEY" -N "" -C "frp-worker@$(hostname)"
  if ! grep -q "Host github-frp" ~/.ssh/config 2>/dev/null; then
    cat >> ~/.ssh/config <<EOF

Host github-frp
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_frp
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
    chmod 600 ~/.ssh/config
  fi
fi

echo ""
echo "=========================================================="
echo "COPY THIS PUBLIC KEY and add it as an SSH deploy key with"
echo "WRITE access on the foodrecipes-page org (or add to your"
echo "own GitHub account SSH keys — simplest for a worker box):"
echo ""
cat "$KEY.pub"
echo ""
echo "URL: https://github.com/settings/keys  →  New SSH key"
echo "=========================================================="
read -rp "Press ENTER after the key is added on GitHub..."

# Accept github.com hostkey silently on first contact
ssh-keyscan -t ed25519 github.com 2>/dev/null >> ~/.ssh/known_hosts || true
ssh -o BatchMode=yes -T git@github-frp 2>&1 | head -1 || true

echo "==> Step 3/6: clone all 27 shards"
mkdir -p "$WORK/repos"
for L in "${LETTERS[@]}"; do
  dir="$WORK/repos/recipes-$L"
  if [[ -d "$dir/.git" ]]; then
    (cd "$dir" && git pull --rebase --quiet || true)
  else
    git clone --quiet --depth 1 "git@github-frp:$ORG/recipes-$L.git" "$dir"
  fi
  (cd "$dir" \
    && git config user.email "frp-worker@$(hostname)" \
    && git config user.name "frp-worker ($(hostname))")
done

echo "==> Step 4/6: install n8n globally"
if ! command -v n8n >/dev/null; then
  sudo npm install -g --silent n8n
fi

echo "==> Step 5/6: install generate-recipe.sh and n8n systemd --user unit"
install -Dm755 "$SCRIPT_DIR/generate-recipe.sh" "$WORK/generate-recipe.sh"
install -Dm755 "$SCRIPT_DIR/report.sh"          "$WORK/report.sh"

# ---- Telegram reporter (optional; skip by pressing ENTER at the prompts) ----
echo ""
echo "==> Telegram progress reporter (3x daily) — optional"
echo "    To enable: create a bot via @BotFather and get your chat id from @userinfobot."
echo "    Leave the token blank to skip for now (you can re-run this script later)."
read -rp "Telegram bot token (or blank to skip): " TG_TOK || TG_TOK=""
TG_CHAT=""
if [[ -n "$TG_TOK" ]]; then
  read -rp "Telegram chat id: " TG_CHAT
fi
if [[ -n "$TG_TOK" && -n "$TG_CHAT" ]]; then
  install -Dm600 /dev/stdin ~/.config/frp-report.env <<EOF
TG_BOT_TOKEN=$TG_TOK
TG_CHAT_ID=$TG_CHAT
EOF
  install -Dm644 "$SCRIPT_DIR/systemd/frp-report.service" \
      ~/.config/systemd/user/frp-report.service
  install -Dm644 "$SCRIPT_DIR/systemd/frp-report.timer" \
      ~/.config/systemd/user/frp-report.timer
  systemctl --user daemon-reload
  systemctl --user enable --now frp-report.timer
  # Fire an initial report so you can confirm it works end-to-end now
  systemctl --user start frp-report.service || true
  echo "    Telegram reporter installed (09:00, 15:00, 21:00)."
else
  echo "    Telegram reporter skipped."
fi

mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/n8n.service <<EOF
[Unit]
Description=n8n (foodrecipes.page worker)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=N8N_HOST=127.0.0.1
Environment=N8N_PORT=5678
Environment=N8N_PROTOCOL=http
Environment=N8N_SECURE_COOKIE=false
Environment=N8N_RUNNERS_ENABLED=true
Environment=DB_SQLITE_POOL_SIZE=5
Environment=PATH=/usr/local/bin:/usr/bin:/bin:%h/.local/bin
ExecStart=/usr/bin/env n8n
Restart=always
RestartSec=30
MemoryHigh=512M

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now n8n
# Keep n8n running even after you log out / close the lid
sudo loginctl enable-linger "$USER"

echo "==> Step 6/6: power settings — stay on with lid closed"
# Best-effort; ignore failure if logind.conf is read-only or on a non-systemd setup
if [[ -w /etc/systemd/logind.conf ]] || sudo test -f /etc/systemd/logind.conf; then
  sudo sed -i \
    -e 's/^#*HandleLidSwitch=.*/HandleLidSwitch=ignore/' \
    -e 's/^#*HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/' \
    -e 's/^#*HandleLidSwitchDocked=.*/HandleLidSwitchDocked=ignore/' \
    /etc/systemd/logind.conf || true
  sudo systemctl restart systemd-logind || true
fi

echo ""
echo "=========================================================="
echo "  DONE."
echo ""
echo "  Open http://localhost:5678 in a browser on this laptop."
echo "  1. Create the owner account (any email/password — local only)"
echo "  2. Workflows → Import from File → pick worker/workflow.json"
echo "  3. Click 'Active' toggle in top-right"
echo ""
echo "  Tail logs anytime:"
echo "     journalctl --user -u n8n -f"
echo ""
echo "  Trigger one recipe manually to test:"
echo "     bash $WORK/generate-recipe.sh"
echo "=========================================================="
