import type { RecipeIndexEntry } from "@/lib/types";

const OWNER = process.env.GITHUB_OWNER || "foodrecipes-page";
const SHARDS = "abcdefghijklmnopqrstuvwxyz".split("");

async function loadShardIndex(letter: string): Promise<RecipeIndexEntry[]> {
  const url = `https://cdn.jsdelivr.net/gh/${OWNER}/recipes-${letter}@main/index.json`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    // Some shards (misc, x) hold a metadata object until they get their first
    // recipe — guard against that so callers always see an array.
    return Array.isArray(data) ? (data as RecipeIndexEntry[]) : [];
  } catch {
    return [];
  }
}

/** Load every shard index in parallel. Cached for 1h via Next fetch revalidate. */
export async function loadCatalog(): Promise<RecipeIndexEntry[]> {
  const all = (await Promise.all(SHARDS.map(loadShardIndex))).flat();
  return all;
}

/** Normalize a label to a URL-safe slug (lowercase kebab). */
export function toFacetSlug(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Pretty-case a facet slug back into a display label. */
export function labelFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

export type FacetCount = { slug: string; label: string; count: number };

/** Aggregate cuisine counts across the catalog. */
export function cuisineFacets(entries: RecipeIndexEntry[]): FacetCount[] {
  const map = new Map<string, FacetCount>();
  for (const e of entries) {
    if (typeof e.cuisine !== "string" || !e.cuisine) continue;
    const slug = toFacetSlug(e.cuisine);
    if (!slug) continue;
    const cur = map.get(slug);
    if (cur) cur.count += 1;
    else map.set(slug, { slug, label: e.cuisine, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Aggregate tag counts. Tags are arbitrary strings written by the worker. */
export function tagFacets(entries: RecipeIndexEntry[]): FacetCount[] {
  const map = new Map<string, FacetCount>();
  for (const e of entries) {
    for (const raw of e.tags || []) {
      if (!raw) continue;
      const slug = toFacetSlug(raw);
      if (!slug) continue;
      const cur = map.get(slug);
      if (cur) cur.count += 1;
      else map.set(slug, { slug, label: labelFromSlug(slug), count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Filter the catalog to entries matching a cuisine slug. */
export function entriesByCuisine(
  entries: RecipeIndexEntry[],
  cuisineSlug: string,
): RecipeIndexEntry[] {
  return entries.filter(
    (e) => typeof e.cuisine === "string" && toFacetSlug(e.cuisine) === cuisineSlug,
  );
}

/** Filter the catalog to entries containing a tag slug. */
export function entriesByTag(
  entries: RecipeIndexEntry[],
  tagSlug: string,
): RecipeIndexEntry[] {
  return entries.filter((e) => (e.tags || []).some((t) => toFacetSlug(t) === tagSlug));
}
