"use client";

import { useState } from "react";
import { TasteWizard } from "./TasteWizard";

// Flavor/mood picker — "I want something ___".
// Tapping opens a wizard where the user refines cuisine / protein / meal / time
// and we pre-generate the recipe in the background while they pick.
export const TASTES: { emoji: string; label: string; query: string }[] = [
  { emoji: "🌶️", label: "Spicy", query: "something spicy and bold for dinner" },
  { emoji: "🍋", label: "Tangy", query: "something tangy and zesty" },
  { emoji: "🌿", label: "Minty", query: "something fresh with mint" },
  { emoji: "🍯", label: "Sweet", query: "a sweet comforting dish" },
  { emoji: "🧂", label: "Savory", query: "deeply savory umami dinner" },
  { emoji: "🔥", label: "Smoky", query: "smoky grilled flavors" },
  { emoji: "🥛", label: "Creamy", query: "rich and creamy dinner" },
  { emoji: "🥬", label: "Fresh", query: "light fresh and healthy" },
  { emoji: "🧄", label: "Garlicky", query: "bold garlicky flavors" },
  { emoji: "🍫", label: "Indulgent", query: "an indulgent treat to cook tonight" },
  { emoji: "🍜", label: "Brothy", query: "a warm brothy bowl" },
  { emoji: "🥜", label: "Nutty", query: "nutty toasted warm flavors" },
];

export type Taste = (typeof TASTES)[number];

export function TastePicker({ className = "" }: { readonly className?: string }) {
  const [seed, setSeed] = useState<(typeof TASTES)[number] | null>(null);

  return (
    <>
      <div className={className}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] md:text-sm text-ink-600/80 leading-snug">
            <span className="font-semibold text-ink-700">How are you feeling tonight?</span>
            <span className="text-ink-600/60"> Pick a vibe — we&apos;ll cook something you&apos;ll love.</span>
          </p>
        </div>

        {/* Mobile: horizontal scroll strip. Desktop: wrap to 2 rows. */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1 md:flex-wrap md:overflow-visible md:justify-start">
          {TASTES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setSeed(t)}
              className="clay-btn shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white border-2 border-brand-100 text-ink-700 px-3 py-1.5 text-[12px] md:text-sm font-semibold shadow-clay-sm hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-600 active:translate-y-0"
            >
              <span className="text-base leading-none">{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <TasteWizard open={seed !== null} seed={seed} onClose={() => setSeed(null)} />
    </>
  );
}
