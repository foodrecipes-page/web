import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let _redis: Redis | null = null;
export function redis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

/** Rate limit anonymous users generating new recipes. */
export function rateLimiter(): Ratelimit | null {
  const r = redis();
  if (!r) return null;
  return new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    analytics: true,
    prefix: "frp:rl:gen",
  });
}

/** Queue key for pending recipe writes (batch-committed by GitHub Action). */
export const QUEUE_KEY = "frp:write-queue";

export async function enqueueRecipe(key: string, recipeJson: unknown): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.lpush(QUEUE_KEY, JSON.stringify({ key, recipeJson, at: Date.now() }));
  // Hot key: serve freshly generated recipes before they hit GitHub/jsDelivr.
  // Keep for 24h; by then the batch commit will have landed.
  await r.set(`frp:hot:${key}`, JSON.stringify(recipeJson), { ex: 60 * 60 * 24 });
}

export async function getHotRecipe(key: string): Promise<unknown | null> {
  const r = redis();
  if (!r) return null;
  const val = await r.get(`frp:hot:${key}`);
  if (!val) return null;
  return typeof val === "string" ? JSON.parse(val) : val;
}
