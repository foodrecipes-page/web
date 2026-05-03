import type { Metadata } from "next";
import { loadCatalog, cuisineFacets, tagFacets } from "@/lib/catalog";

export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://foodrecipes.page";

export async function generateMetadata(): Promise<Metadata> {
  const all = await loadCatalog();
  const title = `Browse ${all.length} recipes — free AI cookbook`;
  const description = `Open recipe cache: ${all.length} AI-generated dishes across world cuisines. Full ingredients, step-by-step instructions, free forever.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/recipes` },
    openGraph: { title, description, url: `${SITE_URL}/recipes`, type: "website" },
  };
}

const CARD_TINTS = [
  "from-brand-50 to-brand-100/40 border-brand-200",
  "from-herb-100/60 to-herb-100/30 border-herb-300/40",
  "from-sun-100 to-sun-100/40 border-sun-300/50",
  "from-blueberry-100 to-blueberry-100/50 border-blueberry-400/30",
];

export default async function RecipesPage() {
  const all = await loadCatalog();
  all.sort((a, b) => a.title.localeCompare(b.title));

  const cuisines = cuisineFacets(all).filter((f) => f.count >= 5).slice(0, 18);
  const tags = tagFacets(all).filter((f) => f.count >= 8).slice(0, 24);

  return (
    <div className="py-4">
      <div className="text-center mb-8">
        <div className="inline-block rounded-full bg-sun-100 text-sun-600 text-[10px] font-bold uppercase tracking-widest px-3 py-1 shadow-clay-sm">
          📚 The Cookbook
        </div>
        <h1 className="mt-3 font-display text-4xl md:text-5xl font-black text-ink-700">
          Browse recipes
        </h1>
        <p className="mt-2 text-ink-600/80">
          <span className="font-bold text-brand-600">{all.length}</span> recipes in our open cache
          {all.length > 0 && <> · all free, all AI-generated, all yours to remix.</>}
        </p>
      </div>

      {cuisines.length > 0 && (
        <section className="mb-8">
          <div className="text-[10px] font-bold uppercase tracking-widest text-ink-600/50 mb-2">
            🌍 Browse by cuisine
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cuisines.map((c) => (
              <a
                key={c.slug}
                href={`/cuisine/${c.slug}`}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white border-2 border-brand-100 text-ink-600 hover:border-brand-300 hover:text-brand-600 hover:-translate-y-0.5 shadow-clay-sm transition-all"
              >
                {c.label} <span className="text-ink-600/50">({c.count})</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {tags.length > 0 && (
        <section className="mb-10">
          <div className="text-[10px] font-bold uppercase tracking-widest text-ink-600/50 mb-2">
            #️⃣ Popular tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <a
                key={t.slug}
                href={`/tag/${t.slug}`}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white border-2 border-herb-200/60 text-ink-600 hover:border-herb-400 hover:text-herb-700 hover:-translate-y-0.5 shadow-clay-sm transition-all"
              >
                #{t.slug} <span className="text-ink-600/50">({t.count})</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {all.length === 0 ? (
        <div className="clay-surface rounded-[2rem] p-10 md:p-14 text-center max-w-xl mx-auto relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-10 -right-10 w-40 h-40 bg-sun-300 opacity-30 blur-2xl"
            style={{ borderRadius: "42% 58% 62% 38% / 50% 42% 58% 50%" }}
          />
          <div className="relative">
            <div className="text-6xl mb-4">🍽️</div>
            <h2 className="font-display text-2xl font-bold text-ink-700">
              The cookbook is empty
            </h2>
            <p className="mt-2 text-ink-600/80">
              Be the first to cook something up — every recipe you generate joins this open cache.
            </p>
            <a
              href="/"
              className="clay-btn mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-sun-500 via-brand-400 to-brand-500 text-white font-bold px-5 py-2.5 shadow-clay-sun hover:-translate-y-0.5 transition-all"
            >
              🍳 Generate the first one →
            </a>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {all.map((r, i) => (
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
                <span className="text-[10px] font-bold text-ink-600/60">
                  ⏱ {r.totalTimeMin}m
                </span>
              </div>
              <div className="font-display text-lg font-bold text-ink-700 leading-snug line-clamp-2 min-h-[3rem]">
                {r.title}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {r.tags.slice(0, 3).map((t) => (
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
      )}
    </div>
  );
}
