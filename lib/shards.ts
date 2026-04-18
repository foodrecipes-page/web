import type { Recipe } from "./types";
import { getShard } from "./parser";

const OWNER = process.env.GITHUB_OWNER || "your-github-username";
const BRANCH = "main";

/**
 * Build the public jsDelivr CDN URL for a given cache key.
 * Shards are structured as `recipes-{letter}` (a..z + misc).
 */
export function cdnUrl(key: string): string {
  const shard = getShard(key);
  return `https://cdn.jsdelivr.net/gh/${OWNER}/recipes-${shard}@${BRANCH}/${key}.json`;
}

/**
 * Fallback raw URL (if jsDelivr is down).
 */
export function rawUrl(key: string): string {
  const shard = getShard(key);
  return `https://raw.githubusercontent.com/${OWNER}/recipes-${shard}/${BRANCH}/${key}.json`;
}

/**
 * Attempts to fetch a recipe from the CDN cache with graceful fallback.
 * Returns null on miss.
 */
export async function fetchFromCache(key: string): Promise<Recipe | null> {
  const urls = [cdnUrl(key), rawUrl(key)];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        return (await res.json()) as Recipe;
      }
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Attempts a retry ladder from most-specific to least-specific.
 * Example order for chicken+rice, cuisine=indian, diet=keto:
 *   1. chicken-rice--indian--keto
 *   2. chicken-rice--indian
 *   3. chicken-rice--keto
 *   4. chicken-rice
 */
export async function fetchWithLadder(
  baseKey: string,
  opts: { cuisine?: string | null; diet?: string | null }
): Promise<{ recipe: Recipe; keyUsed: string } | null> {
  const variants: string[] = [];
  const c = opts.cuisine;
  const d = opts.diet;
  if (c && d) variants.push(`${baseKey}--${[c, d].sort().join("--")}`);
  if (c) variants.push(`${baseKey}--${c}`);
  if (d) variants.push(`${baseKey}--${d}`);
  variants.push(baseKey);

  for (const key of variants) {
    const r = await fetchFromCache(key);
    if (r) return { recipe: r, keyUsed: key };
  }
  return null;
}
