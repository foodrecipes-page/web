# worker — always-on recipe generator (Lubuntu)

A systemd timer fires `generate-recipe.sh` every minute on an old Lubuntu
laptop. The script asks a local Ollama model (`qwen2.5:3b`) to invent + write
one recipe, commits it to the matching `recipes-{letter}` shard, pushes via
SSH, and purges jsDelivr.

**No n8n. No Docker. No Node.** Pure bash + systemd.

## What gets installed

- `~/frp-shards/generate-recipe.sh` — the generator (one recipe per run)
- `~/frp-shards/report.sh` — Telegram progress reporter (optional)
- 27 shard repos cloned at `~/frp-shards/repos/recipes-{a..z,misc}` with SSH
- SSH deploy key at `~/.ssh/id_ed25519_frp`
- `~/.config/systemd/user/frp-generate.{service,timer}` — fires every 60s
- `~/.config/systemd/user/frp-report.{service,timer}` — 3x daily (optional)

Ollama is **not** installed here — you already have it with `qwen2.5:3b`
pulled.

## Setup (once, on the Lubuntu laptop)

```bash
# Clone or scp this repo, then:
cd path/to/foodrecipespage/worker
bash bootstrap.sh
```

The script:

1. Installs `git`, `curl`, `jq`
2. Generates an ed25519 SSH key, prints the public half, waits for you to
   paste it into https://github.com/settings/keys
3. Clones all 27 shards with SSH remotes
4. Installs the generator + reporter scripts
5. Installs + starts the `frp-generate.timer` user unit
6. Optionally sets up Telegram reporting (3× daily)
7. `loginctl enable-linger` → keeps running after logout
8. Edits `/etc/systemd/logind.conf` to ignore lid-close

## Tuning

| Var      | Default            | Meaning                                  |
|----------|--------------------|------------------------------------------|
| `WORK`   | `$HOME/frp-shards` | Root dir for clones + cursor state       |
| `MODEL`  | `qwen2.5:3b`       | Any Ollama model id (`qwen2.5:7b`, etc.) |

Change interval by editing `~/.config/systemd/user/frp-generate.timer`
(`OnUnitActiveSec=`) then `systemctl --user daemon-reload` +
`systemctl --user restart frp-generate.timer`.

## Monitoring

```bash
# Live logs
journalctl --user -u frp-generate -f

# Last 20 runs
journalctl --user -u frp-generate -n 20 --no-pager

# Fire one now (doesn't wait for the timer)
systemctl --user start frp-generate.service

# Timer status
systemctl --user status frp-generate.timer

# Count recipes locally — no API calls
for d in ~/frp-shards/repos/recipes-*; do
  echo "$(basename "$d"): $(ls "$d/recipes" 2>/dev/null | wc -l)"
done
```

## Stopping

```bash
systemctl --user disable --now frp-generate.timer
```

## Telegram progress report (3x daily)

`bootstrap.sh` prompts for this. To enable later:

1. Message **@BotFather** → `/newbot` → copy token.
2. Message **@userinfobot** → copy your chat id.
3. Re-run `bash bootstrap.sh` and paste when prompted — OR:

```bash
install -Dm600 /dev/stdin ~/.config/frp-report.env <<EOF
TG_BOT_TOKEN=123456:ABC-def...
TG_CHAT_ID=123456789
EOF

cd path/to/foodrecipespage/worker
install -Dm644 systemd/frp-report.service ~/.config/systemd/user/frp-report.service
install -Dm644 systemd/frp-report.timer   ~/.config/systemd/user/frp-report.timer
systemctl --user daemon-reload
systemctl --user enable --now frp-report.timer
systemctl --user start frp-report.service   # one immediate test message
```

Reports fire at **09:00, 15:00, 21:00** local time. Edit
`~/.config/systemd/user/frp-report.timer` (`OnCalendar=`) to change.

Each message: total recipes, delta since last report, per-letter counts,
Ollama up/down, disk free, load avg, uptime.

## Notes

- **Resume-safe**: round-robin cursor in `~/frp-shards/.cursor`; existing
  slugs are skipped on the fly.
- **One commit per recipe.** Over time that's a lot of tiny commits — fine
  for git, and jsDelivr caches on `@main` so it doesn't matter.
- **Offline**: `git push` fails loudly, the file still lands on disk, and
  the next run pushes the backlog automatically.
- **Quality**: `qwen2.5:3b` on CPU is solid but not brilliant. Bumping to
  `qwen2.5:7b` on ≥8 GB RAM gives noticeably better recipes.
