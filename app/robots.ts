import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://foodrecipes.page";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
        crawlDelay: 2,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
