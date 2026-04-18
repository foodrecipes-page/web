import type { MetadataRoute } from "next";
import type { RecipeIndexEntry } from "@/lib/types";

const OWNER = process.env.GITHUB_OWNER || "your-github-username";
const SHARDS = "abcdefghijklmnopqrstuvwxyz".split("");

async function loadShardIndex(letter: string): Promise<RecipeIndexEntry[]> {
  try {
    const res = await fetch(
      `https://cdn.jsdelivr.net/gh/${OWNER}/recipes-${letter}@main/index.json`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    return (await res.json()) as RecipeIndexEntry[];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://foodrecipes.page";
  const all = (await Promise.all(SHARDS.map(loadShardIndex))).flat();
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/recipes`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.3 },
    ...all.map((r) => ({
      url: `${base}/recipe/${r.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
