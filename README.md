# foodrecipes.page

AI-powered recipe site. Free forever. Serves recipes from a public GitHub-sharded cache via jsDelivr; falls back to a chain of open AI providers (Groq → Gemini → Cerebras → OpenRouter) when a recipe isn't cached yet. Newly generated recipes are queued to Upstash and batch-committed to the shard repos by a GitHub Action.

## Stack

| Layer | Service | Free tier |
|---|---|---|
| App + API | Next.js 15 on Vercel | Yes |
| Recipe cache | 26 public GitHub repos (`recipes-a` … `recipes-z`) + jsDelivr CDN | Yes |
| Write queue | Upstash Redis | Yes |
| AI | Groq, Gemini, Cerebras, OpenRouter | Yes |
| Geo | Vercel Edge headers | Yes |
| History | Cookie (hints) + LocalStorage (rich) | Free |

## Local setup

```bash
cp .env.example .env.local
# fill in at least GROQ_API_KEY or GEMINI_API_KEY to enable generation
npm install
npm run dev
```

Site runs at http://localhost:3000. Without Upstash credentials, generated recipes are still returned to the user but not persisted.

## One-time: create the 26 shard repos

Using the GitHub CLI (`gh`):

```bash
for letter in a b c d e f g h i j k l m n o p q r s t u v w x y z; do
  gh repo create "recipes-$letter" \
    --public \
    --description "Recipe cache shard ($letter) for foodrecipes.page" \
    --add-readme
done
gh repo create recipes-misc --public \
  --description "Recipe cache shard (non-alpha) for foodrecipes.page" \
  --add-readme
```

Generate a **fine-grained Personal Access Token** with `Contents: Read and write` access limited to these repos. Save it as the `GH_SHARDS_TOKEN` secret in this repo.

## Deploy to Vercel

1. Import this repo in Vercel and deploy.
2. Add env vars from `.env.example` in Vercel Project Settings.
3. Point your `foodrecipes.page` domain at the Vercel project.

## GitHub Action secrets

In this repo's Settings → Secrets and variables → Actions, add:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `GH_OWNER` (your GitHub username)
- `GH_SHARDS_TOKEN` (the fine-grained PAT)

The `flush-queue.yml` workflow runs every 15 minutes and commits freshly generated recipes to the correct shard repo.

## Architecture at a glance

```
User → Next.js (Vercel)
        ├─ client-side intent parser (free, instant)
        ├─ try jsDelivr cache ladder (cuisine+diet → cuisine → base)
        └─ miss → AI fallback chain → enqueue → respond

GitHub Action (every 15 min)
        └─ Upstash queue → commit files to recipes-{shard} → purge jsDelivr
```

## Key files

- [lib/parser.ts](lib/parser.ts) — intent parsing & cache-key builder
- [lib/shards.ts](lib/shards.ts) — jsDelivr URL + retry ladder
- [lib/ai.ts](lib/ai.ts) — multi-provider fallback chain
- [lib/redis.ts](lib/redis.ts) — queue + rate limiter
- [lib/hints.ts](lib/hints.ts) — cookie & localStorage utilities
- [lib/geo.ts](lib/geo.ts) — country → default cuisine
- [app/api/generate/route.ts](app/api/generate/route.ts) — the main endpoint
- [scripts/flush-queue.ts](scripts/flush-queue.ts) — queue → GitHub committer
- [.github/workflows/flush-queue.yml](.github/workflows/flush-queue.yml) — scheduler

## License

Recipes in the shard repos are published under CC BY-NC-SA 4.0. Application code: MIT.
