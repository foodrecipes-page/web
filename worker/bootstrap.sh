#!/usr/bin/env bash
# One-shot setup for the Lubuntu recipe-generation worker.
# Run as a regular user (NOT root). Will sudo only where needed.
#
# Prerequisites:
#   - Ollama installed and `qwen2.5:3b` pulled
#   - This repo cloned anywhere on the laptop
# Usage:
#   cd worker && bash bootstrap.sh

set -euo pipefail

ORG="foodrecipes-page"
WORK="$HOME/frp-shards"
LETTERS=(a b c d e f g h i j k l m n o p q r s t u v w x y z misc)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Step 1/5: system packages (git, curl, jq)"
sudo apt update -qq
sudo apt install -y -qq git curl jq ca-certificates

# ---- 4 GB swap safety net (prevents OOM reboots on 8 GB boxes) ----
if ! swapon --show=NAME --noheadings | grep -q .; then
  if [[ ! -f /swapfile ]]; then
    echo "    creating 4 GB swapfile (one-time)"
    sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
  fi
  sudo swapon /swapfile
  if ! grep -q '^/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  fi
fi
# Prefer RAM; only swap under real pressure. Reduces churn on old disks.
sudo sysctl -w vm.swappiness=10 >/dev/null
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-frp-swappiness.conf >/dev/null

echo "==> Step 2/5: SSH key"
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
echo "COPY THIS PUBLIC KEY and add it to your GitHub account at:"
echo "  https://github.com/settings/keys   (New SSH key)"
echo ""
cat "$KEY.pub"
echo "=========================================================="
read -rp "Press ENTER after the key is added on GitHub..."

ssh-keyscan -t ed25519 github.com 2>/dev/null >> ~/.ssh/known_hosts || true
ssh -o BatchMode=yes -T git@github-frp 2>&1 | head -1 || true

echo "==> Step 3/5: clone all 27 shards"
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

echo "==> Step 4/5: install scripts + systemd --user timers"
install -Dm755 "$SCRIPT_DIR/generate-recipe.sh" "$WORK/generate-recipe.sh"
install -Dm755 "$SCRIPT_DIR/report.sh"          "$WORK/report.sh"

mkdir -p ~/.config/systemd/user
install -Dm644 "$SCRIPT_DIR/systemd/frp-generate.service" ~/.config/systemd/user/frp-generate.service
install -Dm644 "$SCRIPT_DIR/systemd/frp-generate.timer"   ~/.config/systemd/user/frp-generate.timer

# ---- Telegram reporter (optional) ----
echo ""
echo "==> Telegram progress reporter (3x daily) — optional"
echo "    Create a bot via @BotFather; get your chat id from @userinfobot."
echo "    Leave blank to skip (re-run this script later to add)."
read -rp "Telegram bot token (or blank to skip): " TG_TOK || TG_TOK=""
TG_CHAT=""
if [[ -n "$TG_TOK" ]]; then
  read -rp "Telegram chat id: " TG_CHAT
fi
TG_INSTALLED=0
if [[ -n "$TG_TOK" && -n "$TG_CHAT" ]]; then
  install -Dm600 /dev/stdin ~/.config/frp-report.env <<EOF
TG_BOT_TOKEN=$TG_TOK
TG_CHAT_ID=$TG_CHAT
EOF
  install -Dm644 "$SCRIPT_DIR/systemd/frp-report.service" ~/.config/systemd/user/frp-report.service
  install -Dm644 "$SCRIPT_DIR/systemd/frp-report.timer"   ~/.config/systemd/user/frp-report.timer
  TG_INSTALLED=1
else
  echo "    Telegram reporter skipped."
fi

systemctl --user daemon-reload
systemctl --user enable --now frp-generate.timer
if [[ "$TG_INSTALLED" == "1" ]]; then
  systemctl --user enable --now frp-report.timer
  systemctl --user start frp-report.service || true
fi

# Keep user services running after logout / lid close
sudo loginctl enable-linger "$USER"

echo "==> Step 5/5: power settings — stay on with lid closed"
if sudo test -f /etc/systemd/logind.conf; then
  sudo sed -i \
    -e 's/^#*HandleLidSwitch=.*/HandleLidSwitch=ignore/' \
    -e 's/^#*HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/' \
    -e 's/^#*HandleLidSwitchDocked=.*/HandleLidSwitchDocked=ignore/' \
    /etc/systemd/logind.conf || true
  sudo systemctl restart systemd-logind || true
fi

echo ""
echo "=========================================================="
echo "  DONE — timer is live. First recipe in ~1 min."
echo ""
echo "  Status:     systemctl --user status frp-generate.timer"
echo "  Tail logs:  journalctl --user -u frp-generate -f"
echo "  Fire once:  systemctl --user start frp-generate.service"
echo "  Stop:       systemctl --user disable --now frp-generate.timer"
echo "  Count now:  for d in ~/frp-shards/repos/recipes-*; do \\"
echo "                echo \"\$(basename \$d): \$(ls \$d/recipes 2>/dev/null | wc -l)\"; \\"
echo "              done"
echo "=========================================================="
