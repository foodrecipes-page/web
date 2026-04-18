"use client";

import { useEffect, useState } from "react";
import type { Recipe } from "@/lib/types";
import { RecipeView } from "@/components/RecipeView";

export function ClientRecipeFallback({ slug }: { slug: string }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`frp_fresh_${slug}`);
      if (raw) setRecipe(JSON.parse(raw) as Recipe);
    } catch {}
    setChecked(true);
  }, [slug]);

  if (!checked) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="inline-flex items-center gap-2 text-ink-600/60 text-sm font-semibold">
          <span className="inline-block w-4 h-4 border-2 border-brand-300 border-t-brand-600 rounded-full animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="max-w-lg mx-auto text-center py-10 md:py-16">
        <div className="clay-surface rounded-[2rem] p-8 md:p-12 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-10 -left-10 w-40 h-40 bg-brand-300 opacity-25 blur-2xl"
            style={{ borderRadius: "42% 58% 62% 38% / 50% 42% 58% 50%" }}
          />
          <div className="relative">
            <div className="text-6xl mb-4 animate-wiggle inline-block">🍳</div>
            <h1 className="font-display text-4xl md:text-5xl font-black text-ink-700">
              Recipe not found
            </h1>
            <p className="mt-3 text-ink-600/80">
              This one isn&apos;t in our cache yet. Head back and generate it — takes 2 to 5 seconds.
            </p>
            <a
              href="/"
              className="clay-btn mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-sun-500 via-brand-400 to-brand-500 text-white font-bold px-6 py-3 shadow-clay-sun hover:-translate-y-0.5 transition-all"
            >
              🍳 Back to generator <span className="text-lg">→</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <RecipeView recipe={recipe} />;
}
