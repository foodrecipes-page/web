import { GeneratorForm } from "@/components/GeneratorForm";
import { RecentRecipes } from "@/components/RecentRecipes";
import { KeyboardDock } from "@/components/KeyboardDock";
import { MobileDock } from "@/components/MobileDock";
import { SurpriseMe, SurpriseTile } from "@/components/SurpriseMe";
import { TastePicker } from "@/components/TastePicker";
import { Trending } from "@/components/Trending";
import { headers } from "next/headers";
import { COUNTRY_LABEL, defaultCuisineFor } from "@/lib/geo";

const POPULAR_QUERIES = [
  "quick chicken dinner under 30 min",
  "keto high-protein breakfast",
  "vegan indian curry with chickpeas",
  "gluten-free italian pasta",
  "leftover rice fried rice",
  "south indian breakfast",
];

export default async function Home() {
  const h = await headers();
  const country = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "").toUpperCase();
  const suggestedCuisine = defaultCuisineFor(country);
  const countryLabel = COUNTRY_LABEL[country];

  return (
    <div className="pb-[calc(var(--mdock,0px)+1rem)] md:pb-0">
      <KeyboardDock />

      {/* Hero — title + AI branding only on mobile (clean, essentials-first) */}
      <section className="relative py-3 md:py-3 overflow-visible">
        {/* Claymorphic decorative blobs — desktop only. Green leads, orange is a whisper. */}
        <div
          aria-hidden
          className="hidden md:block absolute -top-16 -left-20 w-56 h-56 bg-gradient-to-br from-brand-300 to-brand-400 opacity-[0.12] blur-2xl pointer-events-none animate-blob-morph"
          style={{ borderRadius: "42% 58% 62% 38% / 50% 42% 58% 50%" }}
        />
        <div
          aria-hidden
          className="hidden md:block absolute -bottom-24 -right-16 w-[26rem] h-[26rem] bg-gradient-to-br from-herb-300 to-herb-500 opacity-[0.22] blur-2xl pointer-events-none animate-blob-morph"
          style={{ borderRadius: "58% 42% 38% 62% / 42% 58% 50% 50%", animationDelay: "-4s" }}
        />
        <div
          aria-hidden
          className="hidden md:block absolute top-24 right-1/3 w-40 h-40 bg-blueberry-300 opacity-25 blur-3xl pointer-events-none"
        />

        {/* Floating food emojis — desktop only (mobile is rich enough without them) */}
        <div aria-hidden className="hidden md:block absolute top-6 right-6 text-3xl opacity-80 animate-float-slow pointer-events-none">🍅</div>
        <div aria-hidden className="hidden md:block absolute top-28 left-4 text-3xl opacity-80 animate-float pointer-events-none" style={{ animationDelay: "-1.5s" }}>🥑</div>
        <div aria-hidden className="hidden md:block absolute bottom-10 left-12 text-2xl opacity-70 animate-float-slow pointer-events-none" style={{ animationDelay: "-3s" }}>🌶️</div>
        <div aria-hidden className="hidden md:block absolute bottom-24 right-12 text-3xl opacity-80 animate-float pointer-events-none" style={{ animationDelay: "-2s" }}>🥐</div>

        <div className="relative text-center">
          {/* AI-powered pill — visible on all breakpoints (brand clarity) */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white border-2 border-brand-100 px-3 py-1 text-[11px] font-bold text-ink-700 shadow-clay-sm mb-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-herb-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-herb-500" />
            </span>
            <span className="text-herb-700">AI RECIPES</span>
            <span className="text-ink-600/70">· free forever</span>
          </div>

          <h1 className="font-display text-[26px] md:text-5xl font-black text-ink-700 leading-[1.05] md:leading-[0.95] tracking-tight">
            What&apos;s in your{" "}
            <span className="relative inline-block">
              <span className="relative z-10 bg-gradient-to-br from-herb-600 via-sun-500 to-brand-500 bg-clip-text text-transparent">
                fridge tonight?
              </span>
              <span
                aria-hidden
                className="absolute -bottom-1 left-0 right-0 h-2 bg-sun-300 opacity-60 -z-0 rounded-full blur-sm"
              />
            </span>
          </h1>
          <p className="mt-1.5 md:mt-2 text-[12px] md:text-sm text-ink-600/80 max-w-xl mx-auto">
            Type ingredients. An AI chef writes a recipe in seconds.
            {countryLabel ? (
              <> Tuned for <span className="font-bold text-brand-600">{countryLabel}</span>.</>
            ) : null}
          </p>

          {/* MOBILE-ONLY: "Don't know what to eat?" tile + flavor/mood picker */}
          <div className="md:hidden mt-3 mx-auto max-w-md">
            <SurpriseTile />
            <div className="mt-3 text-left">
              <TastePicker />
            </div>
          </div>

          {/* Desktop-only trust bar (mobile keeps it minimal) */}
          <div className="hidden md:flex mt-2 flex-wrap items-center justify-center gap-1">
            {[
              ["⚡", "Instant when cached"],
              ["🔒", "No tracking"],
              ["💸", "Free forever"],
            ].map(([i, t]) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-white/80 backdrop-blur border border-brand-100 px-2.5 py-0.5 text-[11px] font-semibold text-ink-600 shadow-clay-sm"
              >
                <span>{i}</span>
                <span>{t}</span>
              </span>
            ))}
          </div>

          {/* Desktop-only: inline form + chips (mobile uses sticky bottom dock below) */}
          <div className="hidden md:block mt-3">
            <GeneratorForm defaultCuisine={suggestedCuisine} country={country} />
            <div className="mt-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink-600/50 mb-1.5 text-center">
                ✨ Try one of these
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 max-w-2xl mx-auto">
                {POPULAR_QUERIES.map((q, i) => (
                  <a
                    key={q}
                    href={`/?q=${encodeURIComponent(q)}`}
                    className={`clay-btn text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white border-2 border-brand-100 text-ink-600 hover:border-brand-300 hover:text-brand-600 hover:-translate-y-0.5 shadow-clay-sm ${
                      i % 3 === 0 ? "hover:bg-brand-50" : i % 3 === 1 ? "hover:bg-herb-100" : "hover:bg-sun-100"
                    }`}
                  >
                    {q}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile sticky bottom dock — chips + composer, floats above keyboard */}
      <MobileDock defaultCuisine={suggestedCuisine} country={country} />

      {/* Recent recipes (from user's device) */}
      <RecentRecipes />

      {/* Don't know what to eat? — desktop-only (mobile has compact SurpriseTile in hero) */}
      <section className="hidden md:block mt-12 relative">
        {/* One subtle floating emoji, not a swarm */}
        <div aria-hidden className="absolute -top-4 -right-2 text-3xl opacity-60 animate-float-slow pointer-events-none">🍲</div>

        <div className="clay-surface rounded-[2rem] p-8 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-12 -right-12 w-40 h-40 bg-gradient-to-br from-blueberry-300 to-blueberry-500 opacity-30 blur-2xl pointer-events-none"
            style={{ borderRadius: "42% 58% 62% 38% / 50% 42% 58% 50%" }}
          />
          <div
            aria-hidden
            className="absolute -bottom-8 -left-8 w-32 h-32 bg-gradient-to-br from-sun-300 to-brand-400 opacity-25 blur-2xl pointer-events-none"
            style={{ borderRadius: "58% 42% 38% 62% / 42% 58% 50% 50%" }}
          />

          <div className="relative">
            {/* Headline row */}
            <div className="flex items-center gap-4">
              <div className="shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-blueberry-400 to-blueberry-600 flex items-center justify-center text-3xl shadow-clay">
                🤔
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-blueberry-600">
                  Can&apos;t decide?
                </div>
                <h2 className="font-display text-3xl font-black text-ink-700 leading-tight">
                  Don&apos;t know what to eat?
                </h2>
                <p className="mt-1 text-sm text-ink-600/80">
                  Roll the dice for a full recipe, or tell us the vibe you&apos;re craving.
                </p>
              </div>
              <SurpriseMe className="shrink-0" size="lg" />
            </div>

            {/* Flavor / mood picker — feels integrated, no hard divider */}
            <div className="mt-5 pl-[4.5rem]">
              <TastePicker />
            </div>
          </div>
        </div>
      </section>

      {/* Trending — mobile + desktop. Clean header, no overlapping decoration. */}
      <section className="mt-4 md:mt-12 relative">
        <div className="flex items-end justify-between mb-2 md:mb-5">
          <div>
            <div className="inline-block rounded-full bg-sun-100 text-sun-600 text-[10px] md:text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 md:px-3 md:py-1 shadow-clay-sm">
              🔥 Trending now {countryLabel ? `in ${countryLabel}` : "in your area"}
            </div>
            <h2 className="mt-1 md:mt-2 font-display text-base md:text-3xl font-black text-ink-700 leading-tight">
              What people are cooking
            </h2>
          </div>
          <a
            href="/recipes"
            className="text-[11px] md:text-sm font-bold text-brand-600 hover:text-brand-700 shrink-0"
          >
            See all ›
          </a>
        </div>
        <Trending />
      </section>
    </div>
  );
}
