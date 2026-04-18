"use client";

import { useState } from "react";
import { TASTES, type Taste } from "./TastePicker";
import { TasteWizard } from "./TasteWizard";

function randomTaste(): Taste {
  return TASTES[Math.floor(Math.random() * TASTES.length)];
}

export function SurpriseMe({
  className = "",
  size = "md",
}: {
  readonly className?: string;
  readonly size?: "sm" | "md" | "lg";
}) {
  const [seed, setSeed] = useState<Taste | null>(null);

  const onClick = () => setSeed(randomTaste());

  const pad =
    size === "sm" ? "px-3 py-2 text-sm" : size === "lg" ? "px-5 py-3 text-base" : "px-4 py-2.5 text-sm";

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`clay-btn inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-herb-500 to-herb-700 text-white font-bold shadow-clay-herb hover:-translate-y-0.5 active:translate-y-0 transition-all ring-2 ring-white/70 dark:ring-ink-700/50 ${pad} ${className}`}
      >
        <span className="text-lg leading-none">🎲</span>
        <span className="drop-shadow-sm">Surprise me — pick for me</span>
        <span className="text-lg leading-none">→</span>
      </button>
      <TasteWizard open={seed !== null} seed={seed} onClose={() => setSeed(null)} />
    </>
  );
}

/** Compact tile variant — title on the left, dice on the right. */
export function SurpriseTile({ className = "" }: { readonly className?: string }) {
  const [seed, setSeed] = useState<Taste | null>(null);

  const onClick = () => setSeed(randomTaste());

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`clay-surface w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:translate-y-0.5 transition-transform ${className}`}
      >
        <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-blueberry-400 to-blueberry-600 flex items-center justify-center text-lg shadow-clay-sm">
          🤔
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-widest text-blueberry-600 leading-tight">
            Can&apos;t decide?
          </div>
          <div className="font-display text-[15px] font-black text-ink-700 leading-tight truncate">
            Don&apos;t know what to eat?
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-herb-500 to-herb-700 text-white text-lg shadow-clay-herb ring-2 ring-white/70 dark:ring-ink-700/50">
          🎲
        </span>
      </button>
      <TasteWizard open={seed !== null} seed={seed} onClose={() => setSeed(null)} />
    </>
  );
}
