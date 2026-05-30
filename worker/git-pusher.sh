#!/usr/bin/env bash
# git-pusher.sh — batch git commit + push for all shard repos at fixed intervals.
#
# Why a separate process:
#   forever.sh (and any peers e.g. forever-groq.sh) only writes recipe JSON +
#   updates index.json under a per-repo flock at $repo/.frp-write.lock.
#   This script periodically takes the same flock per repo, batches all
#   pending changes into ONE commit per shard, pushes once, and purges the
#   jsDelivr CDN. Decoupling means generators are never blocked on the
#   network and pushes amortise (1 commit per N recipes instead of 1:1).
#
# Env:
#   GH_ORG          default foodrecipes-page
#   WORK            default $HOME/frp-shards
#   PUSH_INTERVAL   default 60   (seconds between full sweeps)
#   PUSH_LOG        default $HOME/git-pusher.log
#
# Usage (typically launched by frp-supervisor.sh):
#   bash git-pusher.sh

set -uo pipefail

GH_ORG="${GH_ORG:-foodrecipes-page}"
WORK="${WORK:-$HOME/frp-shards}"
PUSH_INTERVAL="${PUSH_INTERVAL:-60}"
LETTERS=(a b c d e f g h i j k l m n o p q r s t u v w x y z misc)

mkdir -p "$WORK"

# Single-instance lock so two pushers can't fight.
exec 9>"$WORK/.git-pusher.lock"
if ! flock -n 9; then
  echo "[$(date '+%F %T')] another git-pusher is running, exiting"
  exit 0
fi

for bin in jq curl git flock; do
  command -v "$bin" >/dev/null || { echo "missing dependency: $bin"; exit 2; }
done

log() { echo "[$(date '+%F %T')] $*"; }

push_repo() {
  local letter="$1"
  local repo="$WORK/repos/recipes-$letter"
  [[ -d "$repo/.git" ]] || return 0

  local commit_msg pushed_files=""
  (
    flock 8
    cd "$repo" || exit 1

    # Anything to commit?
    local pending
    pending=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    [[ "$pending" -eq 0 ]] && exit 99   # 99 = nothing to do (sentinel)

    git add -A 2>/dev/null || exit 1
    # Re-check after add (in case .gitignore'd everything)
    pending=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
    [[ "$pending" -eq 0 ]] && exit 99

    # Capture which recipe files are in this commit (for CDN purge).
    git diff --cached --name-only 2>/dev/null > /tmp/.frp-pusher-$letter.files

    commit_msg="batch: ${pending} files ($(date '+%F %T'))"
    git commit --quiet -m "$commit_msg" || exit 1

    # Push with rebase-on-conflict retry.
    local ok=0 t
    for t in 1 2 3; do
      if git push --quiet origin main 2>/dev/null; then ok=1; break; fi
      git pull --quiet --rebase --autostash 2>/dev/null || true
      sleep $(( t * 2 ))
    done
    [[ "$ok" -eq 1 ]] || exit 2
    exit 0
  ) 8>"$repo/.frp-write.lock"
  local rc=$?

  case "$rc" in
    0)
      local n
      n=$(wc -l < /tmp/.frp-pusher-$letter.files 2>/dev/null | tr -d ' ')
      log "pushed recipes-$letter (${n} files)"

      # Purge jsDelivr for each touched path + index, in background.
      while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        (curl -fsS -m 10 "https://purge.jsdelivr.net/gh/$GH_ORG/recipes-$letter@main/$f" >/dev/null 2>&1 &)
      done < /tmp/.frp-pusher-$letter.files
      rm -f /tmp/.frp-pusher-$letter.files
      ;;
    99)
      : # nothing pending, silent
      ;;
    *)
      log "push FAILED for recipes-$letter (rc=$rc)"
      ;;
  esac
}

log "git-pusher started (interval=${PUSH_INTERVAL}s, repos=${#LETTERS[@]})"
trap 'log "git-pusher stopped"; exit 0' INT TERM

while :; do
  for L in "${LETTERS[@]}"; do
    push_repo "$L"
  done
  sleep "$PUSH_INTERVAL"
done
