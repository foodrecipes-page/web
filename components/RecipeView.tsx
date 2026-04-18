"use client";

import type { Recipe } from "@/lib/types";
import { useEffect, useState } from "react";
import { addToHistory, pushRecent, toggleFavorite, getFavorites } from "@/lib/hints";

const CUISINE_CHIPS = ["indian", "italian", "mexican", "chinese", "japanese", "thai", "french", "german"];
const DIET_CHIPS = ["keto", "vegan", "vegetarian", "gluten-free"];

export function RecipeView({ recipe }: { recipe: Recipe }) {
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    addToHistory({
      slug: recipe.slug,
      title: recipe.title,
      viewedAt: Date.now(),
      cuisine: recipe.cuisine,
    });
    pushRecent(recipe.slug);
    setIsFav(getFavorites().includes(recipe.slug));
  }, [recipe.slug, recipe.title, recipe.cuisine]);

  const baseKey = recipe.slug.split("--")[0];

  return (
    <article className="max-w-3xl mx-auto">
      <div className="clay-surface rounded-[2rem] p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {recipe.cuisine && (
                <span className="px-2.5 py-1 rounded-full bg-brand-100 text-brand-700 text-xs font-bold shadow-clay-sm capitalize">
                  {recipe.cuisine}
                </span>
              )}
              {recipe.diet?.map((d) => (
                <span
                  key={d}
                  className="px-2.5 py-1 rounded-full bg-herb-100 text-herb-700 text-xs font-bold shadow-clay-sm capitalize"
                >
                  {d}
                </span>
              ))}
              {recipe.providerUsed && (
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-ink-600/50 bg-white/70 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-herb-500 animate-pulse" />
                  via {recipe.providerUsed}
                </span>
              )}
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-black text-ink-700 leading-tight">
              {recipe.title}
            </h1>
            <p className="mt-3 text-ink-600/80 leading-relaxed">{recipe.description}</p>
          </div>
          <button
            onClick={() => {
              const now = toggleFavorite(recipe.slug);
              setIsFav(now);
            }}
            className={`clay-btn shrink-0 rounded-2xl border-2 px-4 py-2 text-sm font-bold transition-all ${
              isFav
                ? "bg-gradient-to-br from-sun-500 to-brand-500 text-white border-brand-500 shadow-clay-sun"
                : "bg-white border-brand-100 text-ink-600 hover:border-brand-300 shadow-clay-sm"
            }`}
          >
            {isFav ? "★ Saved" : "☆ Save"}
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {[
            ["⏱", `${recipe.totalTimeMin} min`, "bg-blueberry-100 text-blueberry-600"],
            ["🍽", `${recipe.servings} servings`, "bg-sun-100 text-sun-600"],
            ["📊", recipe.difficulty, "bg-herb-100 text-herb-700"],
          ].map(([i, v, c]) => (
            <span
              key={v}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold shadow-clay-sm ${c}`}
            >
              <span>{i}</span>
              <span>{v}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-8 grid md:grid-cols-[280px_1fr] gap-6">
        <section className="clay-surface rounded-3xl p-6 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center shadow-clay">🥕</span>
            <h2 className="font-display text-xl font-bold text-ink-700">Ingredients</h2>
          </div>
          <ul className="space-y-2.5">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-brand-500 mt-1.5 shrink-0">●</span>
                <span>
                  <strong className="font-bold text-ink-700">{ing.amount}</strong>{" "}
                  <span className="text-ink-600/90">{ing.name}</span>
                  {ing.notes && (
                    <span className="block text-xs text-ink-600/60 mt-0.5">{ing.notes}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="clay-surface rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-herb-500 to-herb-700 text-white flex items-center justify-center shadow-clay-herb">👨‍🍳</span>
            <h2 className="font-display text-xl font-bold text-ink-700">Instructions</h2>
          </div>
          <ol className="space-y-4">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 w-8 h-8 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white text-sm font-black flex items-center justify-center shadow-clay">
                  {i + 1}
                </span>
                <p className="text-ink-700 leading-relaxed pt-1">{step}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="mt-10 clay-surface rounded-3xl p-6 md:p-8 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-8 -right-8 w-32 h-32 bg-sun-300 opacity-30 blur-2xl"
          style={{ borderRadius: "42% 58% 62% 38% / 50% 42% 58% 50%" }}
        />
        <div className="relative">
          <h3 className="font-display text-xl font-bold text-ink-700 mb-1">✨ Try this in another style</h3>
          <p className="text-sm text-ink-600/70 mb-4">Same dish, different cuisine or diet — one click away.</p>
          <div className="flex flex-wrap gap-2">
            {CUISINE_CHIPS.filter((c) => c !== recipe.cuisine).map((c) => (
              <a
                key={c}
                href={`/recipe/${baseKey}--${c}`}
                className="clay-btn px-3.5 py-1.5 rounded-full text-sm font-semibold bg-white border-2 border-brand-100 hover:border-brand-400 hover:-translate-y-0.5 text-ink-600 hover:text-brand-600 shadow-clay-sm capitalize"
              >
                {c}
              </a>
            ))}
            {DIET_CHIPS.filter((d) => !recipe.diet?.includes(d)).map((d) => (
              <a
                key={d}
                href={`/recipe/${baseKey}--${d}`}
                className="clay-btn px-3.5 py-1.5 rounded-full text-sm font-semibold bg-white border-2 border-brand-100 hover:border-herb-400 hover:-translate-y-0.5 text-ink-600 hover:text-herb-700 shadow-clay-sm capitalize"
              >
                {d}
              </a>
            ))}
          </div>
        </div>
      </section>

      {recipe.nutrition && (
        <section className="mt-6 rounded-2xl bg-white/60 border border-brand-100 px-5 py-3 text-sm font-medium text-ink-600/80">
          <span className="font-bold text-ink-700">Nutrition (approx):</span>{" "}
          {recipe.nutrition.calories} cal · {recipe.nutrition.protein}g protein ·{" "}
          {recipe.nutrition.carbs}g carbs · {recipe.nutrition.fat}g fat
        </section>
      )}
    </article>
  );
}
