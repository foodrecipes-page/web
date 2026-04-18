"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseQuery } from "@/lib/parser";
import { readHintsClient, writeHints } from "@/lib/hints";
import { CookingLoader } from "./CookingLoader";

const CUISINE_OPTIONS = ["indian", "italian", "mexican", "chinese", "japanese", "thai", "american", "french", "german", "uk"];
const DIET_OPTIONS = ["keto", "vegan", "vegetarian", "gluten-free", "high-protein", "diabetic"];

export function GeneratorForm({
  defaultCuisine,
  country,
  bare = false,
}: {
  defaultCuisine: string | null;
  country: string;
  bare?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(defaultCuisine);
  const [diet, setDiet] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const intent = parseQuery(text);
  const activeFilters = (cuisine ? 1 : 0) + (diet ? 1 : 0);

  useEffect(() => {
    const h = readHintsClient();
    if (!h.cuisine && defaultCuisine) {
      writeHints({ ...h, c: country || h.c, cuisine: defaultCuisine });
    }
    if (h.cuisine) setCuisine(h.cuisine);
    if (h.diet) setDiet(h.diet);

    // Prefill from ?q=... (popular query chips on landing page)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      if (q) setText(q);
    }
  }, [defaultCuisine, country]);

  function onChip(type: "cuisine" | "diet", value: string) {
    const next = type === "cuisine" ? (cuisine === value ? null : value) : cuisine;
    const nextDiet = type === "diet" ? (diet === value ? null : value) : diet;
    if (type === "cuisine") setCuisine(next);
    else setDiet(nextDiet);
    const h = readHintsClient();
    writeHints({ ...h, cuisine: type === "cuisine" ? next : h.cuisine, diet: type === "diet" ? nextDiet : h.diet });
  }

  async function onGenerate() {
    if (pending) return; // guard against double submits
    setError(null);
    const ingredients = intent.ingredients.length ? intent.ingredients : text.split(/[,\s]+/).filter(Boolean);
    if (!ingredients.length && !intent.dish) {
      setError("Tell us at least one ingredient or dish.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients,
          cuisine: intent.cuisine || cuisine,
          diet: intent.diet || diet,
          meal: intent.meal,
          dish: intent.dish,
          raw: text,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Something went wrong. Try again.");
        return;
      }
      const data = await res.json();
      if (data.slug) {
        // Stash freshly generated recipe so the recipe page can render it
        // even when the CDN cache / Redis aren't configured (local dev).
        if (data.recipe) {
          try {
            sessionStorage.setItem(`frp_fresh_${data.slug}`, JSON.stringify(data.recipe));
          } catch {}
        }
        router.push(`/recipe/${data.slug}`);
      }
    });
  }

  const detected = [
    intent.cuisine && { k: "cuisine", v: intent.cuisine },
    intent.diet && { k: "diet", v: intent.diet },
    intent.meal && { k: "meal", v: intent.meal },
    intent.dish && { k: "dish", v: intent.dish },
    intent.protein && { k: "protein", v: intent.protein },
    intent.time && { k: "time", v: intent.time },
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className={bare ? "relative" : "clay-surface rounded-[1.5rem] p-3 md:p-4 relative"}>
        {/* Textarea on top, Generate button below — on every breakpoint */}
        <div className="flex flex-col gap-2">
          <div className="relative w-full">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !pending && e.metaKey) {
                  e.preventDefault();
                  onGenerate();
                }
              }}
              placeholder="What's in your fridge? e.g. chicken, garlic, rice…"
              className="w-full resize-none rounded-xl border-2 border-brand-100 bg-cream-50/60 p-3 pr-10 outline-none focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-100 text-[15px] font-medium placeholder:text-ink-600/40 transition min-h-[72px] md:min-h-[88px]"
              rows={2}
            />
            <div className="absolute top-2.5 right-3 text-lg opacity-50 pointer-events-none">🥘</div>
          </div>
          <button
            onClick={onGenerate}
            disabled={pending}
            aria-label="Generate recipe"
            className="clay-btn w-full rounded-xl bg-gradient-to-br from-sun-500 via-brand-400 to-brand-500 hover:from-sun-600 hover:to-brand-600 disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold shadow-clay-sun hover:-translate-y-0.5 active:translate-y-0 transition-all h-[48px] px-4 flex items-center justify-center gap-2"
          >
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                <span className="text-sm">Cooking…</span>
              </span>
            ) : (
              <>
                <span className="text-lg">🍳</span>
                <span className="text-sm md:text-base">Generate My Recipe</span>
                <span className="text-lg">→</span>
              </>
            )}
          </button>
        </div>

        {/* Mobile-only filters toggle + detected row */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="md:hidden clay-btn inline-flex items-center gap-1 rounded-full bg-white border-2 border-brand-100 text-ink-600 hover:border-brand-300 shadow-clay-sm px-2.5 py-1 text-[11px] font-semibold"
          >
            <span>🎛</span>
            <span>Filters</span>
            {activeFilters > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand-500 text-white text-[9px] font-bold">
                {activeFilters}
              </span>
            )}
            <span className="text-[9px] opacity-60">{filtersOpen ? "▲" : "▼"}</span>
          </button>

          {/* Selected filters as pills (always visible, summary) */}
          {cuisine && (
            <button
              type="button"
              onClick={() => onChip("cuisine", cuisine)}
              className="md:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-500 text-white text-[11px] font-bold shadow-clay-sm capitalize"
            >
              {cuisine} <span className="opacity-70">✕</span>
            </button>
          )}
          {diet && (
            <button
              type="button"
              onClick={() => onChip("diet", diet)}
              className="md:hidden inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-herb-600 text-white text-[11px] font-bold shadow-clay-sm capitalize"
            >
              {diet} <span className="opacity-70">✕</span>
            </button>
          )}

          {detected.length > 0 && (
            <>
              <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest text-ink-600/50">
                Detected
              </span>
              {detected.map((d) => (
                <span
                  key={d.k + d.v}
                  className="px-2 py-0.5 md:px-2.5 md:py-1 rounded-full bg-herb-100 text-herb-700 text-[11px] md:text-xs font-bold shadow-clay-sm border border-herb-300/40"
                >
                  ✓ {d.v}
                </span>
              ))}
            </>
          )}
        </div>

        {/* Filters block: always visible on md+, collapsible on mobile */}
        <div className={`${filtersOpen ? "block" : "hidden md:block"}`}>
          <div className="mt-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-ink-600/50 mb-1.5">
              🍜 Cuisine
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CUISINE_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => onChip("cuisine", c)}
                  className={`clay-btn px-3 py-1 rounded-full text-xs font-semibold border-2 capitalize transition-all ${
                    cuisine === c
                      ? "bg-gradient-to-br from-brand-400 to-brand-600 text-white border-brand-500 shadow-clay"
                      : "bg-white text-ink-600 border-brand-100 hover:border-brand-300 hover:-translate-y-0.5 shadow-clay-sm"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-ink-600/50 mb-1.5">
              🌿 Diet
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DIET_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => onChip("diet", d)}
                  className={`clay-btn px-3 py-1 rounded-full text-xs font-semibold border-2 capitalize transition-all ${
                    diet === d
                      ? "bg-gradient-to-br from-herb-500 to-herb-700 text-white border-herb-600 shadow-clay-herb"
                      : "bg-white text-ink-600 border-brand-100 hover:border-herb-300 hover:-translate-y-0.5 shadow-clay-sm"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 border-2 border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {pending && <CookingLoader compact />}
      </div>
    </div>
  );
}
