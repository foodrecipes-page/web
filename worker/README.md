# worker — always-on recipe generator (Lubuntu)

A tiny n8n workflow that runs every minute on an old Lubuntu laptop, asks a
local Ollama model (`qwen2.5:3b`) to invent + generate one recipe, and pushes
it to the correct `recipes-{letter}` shard via SSH.

## What gets installed

- **n8n** — orchestrator (systemd `--user` unit, survives reboots, runs with lid closed)
- **generate-recipe.sh** — the real work: one recipe → one git commit → one push → jsDelivr purge
- 27 shard repos cloned under `~/frp-shards/repos/recipes-*` with SSH remotes
- SSH deploy key at `~/.ssh/id_ed25519_frp`

Ollama is **not** installed by `bootstrap.sh` — you already have it with
`qwen2.5:3b` pulled.

## Setup (once, on the Lubuntu laptop)

```bash
# On the worker laptop — clone or scp this repo, then:
cd path/to/foodrecipespage/worker
bash bootstrap.sh
```

The script will:

1. Install `nodejs 20`, `jq`, `git`, `n8n`
2. Generate an ed25519 SSH key and print the public half — you paste it into
   https://github.com/settings/keys (or as an org deploy key)
3. Clone all 27 shards with SSH remotes
4. Install `generate-recipe.sh` at `~/frp-shards/generate-recipe.sh`
5. Install + start the `n8n.service` user unit; enable `loginctl linger` so
   it keeps running after logout
6. Disable lid-close suspend in `/etc/systemd/logind.conf`

Then open `http://localhost:5678`, create the owner account (local-only), and
**Workflows → Import from File → `worker/workflow.json`**. Toggle **Active**.

## Tuning

Environment variables (put in `~/.profile` or pass via the n8n node):

| Var      | Default            | Meaning                                     |
|----------|--------------------|---------------------------------------------|
| `WORK`   | `$HOME/frp-shards` | Root dir for the 27 clones + state          |
| `MODEL`  | `qwen2.5:3b`       | Any Ollama model id (`qwen2.5:7b`, etc.)    |

Change the cron interval in n8n (Schedule Trigger node) if 1/min is too fast
for your hardware — 2 or 5 min is fine.

## Monitoring

```bash
# Tail n8n
journalctl --user -u n8n -f

# See the last 10 recipe runs in n8n UI
open http://localhost:5678  →  Executions

# Trigger one manually (bypasses n8n)
bash ~/frp-shards/generate-recipe.sh

# Count recipes locally (no API)
for d in ~/frp-shards/repos/recipes-*; do
  echo "$(basename "$d"): $(ls "$d/recipes" 2>/dev/null | wc -l)"
done
```

## Telegram progress report (3x daily)

`bootstrap.sh` offers to set this up. If you skipped it or want to enable
later, do this on the worker:

1. On your phone, message **@BotFather** → `/newbot` → copy the HTTP token.
2. Message **@userinfobot** → copy your numeric *chat id*.
3. Run:

   ```bash
   install -Dm600 /dev/stdin ~/.config/frp-report.env <<EOF
   TG_BOT_TOKEN=123456:ABC-def...
   TG_CHAT_ID=123456789
   EOF

   install -Dm644 ~/foodrecipes/worker/systemd/frp-report.service \
       ~/.config/systemd/user/frp-report.service
   install -Dm644 ~/foodrecipes/worker/systemd/frp-report.timer \
       ~/.config/systemd/user/frp-report.timer

   systemctl --user daemon-reload
   systemctl --user enable --now frp-report.timer
   systemctl --user start frp-report.service   # send one now
   ```

Reports fire at **09:00, 15:00, 21:00** local time. Edit
`~/.config/systemd/user/frp-report.timer` (`OnCalendar=` lines) to change.

Each message shows: total recipes, delta since last report, per-letter
counts, Ollama up/down, disk free, load avg, uptime.


## Stopping

```bash
systemctl --user stop n8n      # pause
systemctl --user disable n8n   # don't start on boot
```

## Notes

- The script is **resume-safe**: round-robin cursor lives in `~/frp-shards/.cursor`
  and already-existing slugs are skipped on the fly.
- Each run produces **one commit per recipe** on the shard repo. Over weeks
  that's thousands of tiny commits — fine for git, and jsDelivr caches on
  `@main` so readers don't care.
- If the laptop is offline, `git push` fails loudly, the file still lands on
  disk, and the next successful run catches up (because git commits queued).
- Quality: `qwen2.5:3b` on CPU produces solid but not brilliant recipes.
  Bumping to `qwen2.5:7b` on a box with ≥8 GB RAM noticeably improves prose.
