import type { MetadataRoute } from "next";
import { loadCatalog, cuisineFacets, tagFacets } from "@/lib/catalog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://foodrecipes.page";
  const all = await loadCatalog();

  const recipeUrls = all.map((r) => ({
    url: `${base}/recipe/${r.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const cuisineUrls = cuisineFacets(all)
    .filter((f) => f.count >= 5)
    .map((f) => ({
      url: `${base}/cuisine/${f.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  const tagUrls = tagFacets(all)
    .filter((f) => f.count >= 8)
    .map((f) => ({
      url: `${base}/tag/${f.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/recipes`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.3 },
    ...cuisineUrls,
    ...tagUrls,
    ...recipeUrls,
  ];
}
