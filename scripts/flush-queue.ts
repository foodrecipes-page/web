/**
 * Flushes the Upstash write queue and commits recipes to their
 * respective GitHub shard repos.
 *
 * Invoked by .github/workflows/flush-queue.yml on a schedule.
 *
 * Env required:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *   GITHUB_TOKEN (with contents:write on all shard repos)
 *   GITHUB_OWNER
 */

import { Redis } from "@upstash/redis";

const OWNER = process.env.GITHUB_OWNER;
const TOKEN = process.env.GITHUB_TOKEN;
const QUEUE_KEY = "frp:write-queue";
const BATCH = 50;

if (!OWNER || !TOKEN) {
  console.error("Missing GITHUB_OWNER or GITHUB_TOKEN");
  process.exit(1);
}
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL/TOKEN");
  process.exit(1);
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function shardFor(key: string): string {
  const first = key[0]?.toLowerCase();
  if (!first || !/[a-z]/.test(first)) return "misc";
  return first;
}

async function gh(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`GitHub ${path} ${res.status}: ${await res.text()}`);
  }
  return res;
}

async function getFileSha(repo: string, filePath: string): Promise<string | null> {
  const res = await gh(`/repos/${OWNER}/${repo}/contents/${filePath}`);
  if (res.status === 404) return null;
  const data = await res.json();
  return data.sha || null;
}

async function putFile(repo: string, filePath: string, content: string, message: string) {
  const sha = await getFileSha(repo, filePath);
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content).toString("base64"),
  };
  if (sha) body.sha = sha;
  const res = await gh(`/repos/${OWNER}/${repo}/contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`put ${repo}/${filePath} failed: ${res.status}`);
}

type QueueItem = { key: string; recipeJson: unknown; at: number };

async function main() {
  const items: QueueItem[] = [];
  for (let i = 0; i < BATCH; i++) {
    const raw = await redis.rpop<string>(QUEUE_KEY);
    if (!raw) break;
    try {
      items.push(typeof raw === "string" ? JSON.parse(raw) : (raw as QueueItem));
    } catch {
      console.warn("Skipping unparseable queue item");
    }
  }

  if (items.length === 0) {
    console.log("Queue empty.");
    return;
  }

  // Group by shard for per-repo writes + per-repo index update
  const byShard = new Map<string, QueueItem[]>();
  for (const it of items) {
    const s = shardFor(it.key);
    if (!byShard.has(s)) byShard.set(s, []);
    byShard.get(s)!.push(it);
  }

  for (const [shard, group] of byShard) {
    const repo = `recipes-${shard}`;
    console.log(`[${repo}] committing ${group.length} recipe(s)`);

    // 1. Write each recipe JSON
    for (const it of group) {
      await putFile(
        repo,
        `${it.key}.json`,
        JSON.stringify(it.recipeJson, null, 2),
        `add: ${it.key}`
      );
    }

    // 2. Update index.json for this shard
    const existing = await gh(`/repos/${OWNER}/${repo}/contents/index.json`);
    let index: unknown[] = [];
    if (existing.ok) {
      const data = await existing.json();
      try {
        index = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
      } catch {
        index = [];
      }
    }
    const indexBySlug = new Map<string, unknown>();
    for (const entry of index as { slug: string }[]) indexBySlug.set(entry.slug, entry);
    for (const it of group) {
      const r = it.recipeJson as {
        slug: string;
        title: string;
        tags: string[];
        cuisine: string | null;
        totalTimeMin: number;
      };
      indexBySlug.set(r.slug, {
        slug: r.slug,
        title: r.title,
        tags: r.tags || [],
        cuisine: r.cuisine,
        totalTimeMin: r.totalTimeMin,
        shard,
      });
    }
    const merged = Array.from(indexBySlug.values());
    await putFile(
      repo,
      "index.json",
      JSON.stringify(merged, null, 2),
      `index: +${group.length} entries`
    );

    // 3. Purge jsDelivr CDN so fresh recipes appear immediately
    try {
      await fetch(`https://purge.jsdelivr.net/gh/${OWNER}/${repo}@main/index.json`);
      for (const it of group) {
        await fetch(`https://purge.jsdelivr.net/gh/${OWNER}/${repo}@main/${it.key}.json`);
      }
    } catch (err) {
      console.warn("jsDelivr purge failed (non-fatal):", (err as Error).message);
    }
  }

  console.log(`Flushed ${items.length} recipes across ${byShard.size} shards.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
