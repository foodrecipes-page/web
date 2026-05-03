import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  loadCatalog,
  cuisineFacets,
  entriesByCuisine,
  labelFromSlug,
} from "@/lib/catalog";

type PageProps = { params: Promise<{ slug: string }> };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://foodrecipes.page";

export const revalidate = 3600;

const CARD_TINTS = [
  "from-brand-50 to-brand-100/40 border-brand-200",
  "from-herb-100/60 to-herb-100/30 border-herb-300/40",
  "from-sun-100 to-sun-100/40 border-sun-300/50",
  "from-blueberry-100 to-blueberry-100/50 border-blueberry-400/30",
];

/** Pre-generate landing pages for cuisines with >= 5 recipes. */
export async function generateStaticParams() {
  const all = await loadCatalog();
  return cuisineFacets(all)
    .filter((f) => f.count >= 5)
    .map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const all = await loadCatalog();
  const entries = entriesByCuisine(all, slug);
  if (entries.length === 0) {
    return { title: "Cuisine not found", robots: { index: false } };
  }
  const label = entries[0].cuisine || labelFromSlug(slug);
  const title = `${label} recipes — ${entries.length} free AI-generated dishes`;
  const description = `Browse ${entries.length} ${label} recipes — full ingredients, step-by-step instructions, free forever. AI-generated, open recipe cache.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/cuisine/${slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/cuisine/${slug}`,
      type: "website",
    },
  };
}

export default async function CuisinePage({ params }: PageProps) {
  const { slug } = await params;
  const all = await loadCatalog();
  const entries = entriesByCuisine(all, slug);
  if (entries.length === 0) notFound();

  const label = entries[0].cuisine || labelFromSlug(slug);
  entries.sort((a, b) => a.title.localeCompare(b.title));

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Recipes", item: `${SITE_URL}/recipes` },
      { "@type": "ListItem", position: 3, name: `${label} recipes`, item: `${SITE_URL}/cuisine/${slug}` },
    ],
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${label} recipes`,
    numberOfItems: entries.length,
    itemListElement: entries.slice(0, 50).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/recipe/${r.slug}`,
      name: r.title,
    })),
  };

  return (
    <div className="py-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <nav className="text-[11px] font-semibold text-ink-600/70 mb-3">
        <a href="/" className="hover:text-brand-600">Home</a>
        <span className="mx-1.5 text-brand-200">›</span>
        <a href="/recipes" className="hover:text-brand-600">Recipes</a>
        <span className="mx-1.5 text-brand-200">›</span>
        <span className="text-ink-700">{label}</span>
      </nav>

      <div className="text-center mb-8">
        <div className="inline-block rounded-full bg-brand-100 text-brand-600 text-[10px] font-bold uppercase tracking-widest px-3 py-1 shadow-clay-sm">
          🌍 Cuisine
        </div>
        <h1 className="mt-3 font-display text-4xl md:text-5xl font-black text-ink-700">
          {label} recipes
        </h1>
        <p className="mt-2 text-ink-600/80">
          <span className="font-bold text-brand-600">{entries.length}</span> AI-generated {label} dishes — full recipes, free forever.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {entries.map((r, i) => (
          <a
            key={r.slug}
            href={`/recipe/${r.slug}`}
            className={`rounded-3xl bg-gradient-to-br ${
              CARD_TINTS[i % CARD_TINTS.length]
            } border-2 p-5 shadow-clay-sm hover:shadow-clay hover:-translate-y-1 transition-all duration-300`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-600/60 bg-white/70 rounded-full px-2 py-0.5">
                {r.cuisine || "—"}
              </span>
              <span className="text-[10px] font-bold text-ink-600/60">⏱ {r.totalTimeMin}m</span>
            </div>
            <div className="font-display text-lg font-bold text-ink-700 leading-snug line-clamp-2 min-h-[3rem]">
              {r.title}
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {(r.tags || []).slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="text-[10px] font-semibold uppercase tracking-wide text-ink-600/60 bg-white/60 rounded-full px-1.5 py-0.5"
                >
                  #{t}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
