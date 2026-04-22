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
```

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
