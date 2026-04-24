#!/usr/bin/env bash
# Minimal one-shot setup for a fresh headless Debian 12 box.
# Run as a regular user (NOT root). Sudoes only where needed.
#
# Prerequisite: the box can SSH out to github.com and curl out to the internet.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/foodrecipes-page/web/main/worker/debian-setup.sh | bash
# Or clone this repo first and run:
#   bash worker/debian-setup.sh

set -euo pipefail

ORG="foodrecipes-page"
WORK="$HOME/frp-shards"
LETTERS=(a b c d e f g h i j k l m n o p q r s t u v w x y z misc)

echo "==> Updating apt and installing core packages"
sudo apt update -qq
sudo apt install -y -qq git curl jq ca-certificates coreutils util-linux zstd xz-utils tar

# ---- 4 GB swap (lifesaver on 8 GB boxes) ----
if ! swapon --show=NAME --noheadings | grep -q .; then
  echo "==> Creating 4 GB swapfile"
  if [[ ! -f /swapfile ]]; then
    sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile >/dev/null
  fi
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
sudo sysctl -w vm.swappiness=10 >/dev/null
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-frp.conf >/dev/null

# ---- ollama (official installer) ----
if ! command -v ollama >/dev/null; then
  echo "==> Installing Ollama"
  curl -fsSL https://ollama.com/install.sh | sh
fi

# ---- pull the model ----
echo "==> Pulling qwen2.5:3b (~2 GB, one-time)"
ollama pull qwen2.5:3b

# ---- SSH key for git pushes ----
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
ssh-keyscan -t ed25519 github.com 2>/dev/null >> ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts

echo ""
echo "=========================================================="
echo "  Add this SSH key to GitHub (or as an org deploy key):"
echo "  https://github.com/settings/keys  →  New SSH key"
echo ""
cat "$KEY.pub"
echo "=========================================================="
read -rp "Press ENTER after adding the key..."

ssh -o BatchMode=yes -T git@github-frp 2>&1 | head -1 || true

# ---- clone all 27 shards ----
echo "==> Cloning 27 shard repos"
mkdir -p "$WORK/repos"
for L in "${LETTERS[@]}"; do
  dir="$WORK/repos/recipes-$L"
  if [[ -d "$dir/.git" ]]; then
    (cd "$dir" && git pull --rebase --quiet 2>/dev/null || true)
  else
    git clone --quiet --depth 1 "git@github-frp:$ORG/recipes-$L.git" "$dir"
  fi
  (cd "$dir" \
    && git config user.email "frp-worker@$(hostname)" \
    && git config user.name  "frp-worker ($(hostname))")
done

# ---- copy ontology + script into $WORK ----
echo "==> Copying ontology.json and forever.sh"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
if [[ -f "$REPO_ROOT/public/data/ontology.json" ]]; then
  install -m644 "$REPO_ROOT/public/data/ontology.json" "$WORK/ontology.json"
else
  # fallback: fetch from the published repo main
  curl -fsSL "https://raw.githubusercontent.com/$ORG/web/main/public/data/ontology.json" \
    -o "$WORK/ontology.json"
fi
install -m755 "$SCRIPT_DIR/forever.sh" "$WORK/forever.sh"

# ---- optional Telegram creds ----
echo ""
echo "==> Telegram hourly report (optional — press ENTER to skip)"
read -rp "TG_BOT_TOKEN: " TG_TOK || TG_TOK=""
TG_CHAT=""
[[ -n "$TG_TOK" ]] && read -rp "TG_CHAT_ID: " TG_CHAT
if [[ -n "$TG_TOK" && -n "$TG_CHAT" ]]; then
  install -m600 /dev/stdin ~/.frp.env <<EOF
export TG_BOT_TOKEN=$TG_TOK
export TG_CHAT_ID=$TG_CHAT
EOF
  echo "  saved creds to ~/.frp.env"
fi

echo ""
echo "=========================================================="
echo "  DONE. To start the forever loop:"
echo ""
echo "    cd \$HOME/frp-shards"
echo "    source ~/.frp.env 2>/dev/null; nohup bash forever.sh >> ~/forever.log 2>&1 &"
echo "    disown"
echo ""
echo "  Tail logs:   tail -f ~/forever.log"
echo "  Stop:        pkill -INT -f forever.sh"
echo "  Recipe tally:"
echo "    for d in \$HOME/frp-shards/repos/recipes-*; do"
echo "      echo \"\$(basename \$d): \$(ls \$d/recipes 2>/dev/null | wc -l)\""
echo "    done"
echo "=========================================================="
