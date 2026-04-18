"use client";

import { useEffect, useState } from "react";
import { getHistory, getFavorites, type HistoryEntry } from "@/lib/hints";

export function RecentRecipes() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => {
    setHistory(getHistory().slice(0, 8));
    setFavs(getFavorites());
  }, []);

  if (history.length === 0) return null;

  const cardStyles = [
    "from-brand-50 to-brand-100/50 border-brand-200",
    "from-herb-100 to-herb-100/50 border-herb-300/40",
    "from-sun-100 to-sun-100/40 border-sun-300/50",
    "from-blueberry-100 to-blueberry-100/50 border-blueberry-400/30",
  ];

  return (
    <section className="mt-16">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="inline-block rounded-full bg-brand-100 text-brand-600 text-[10px] font-bold uppercase tracking-widest px-3 py-1 shadow-clay-sm">
            🍽️ Your cookbook
          </div>
          <h2 className="mt-2 font-display text-3xl font-black text-ink-700">
            Recently cooked up
          </h2>
        </div>
        <span className="text-xs font-semibold text-ink-600/50 pb-1">
          🔒 Stored on your device only
        </span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x no-scrollbar">
        {history.map((h, i) => (
          <a
            key={h.slug}
            href={`/recipe/${h.slug}`}
            className={`shrink-0 snap-start w-60 rounded-3xl bg-gradient-to-br ${
              cardStyles[i % cardStyles.length]
            } border-2 p-5 shadow-clay-sm hover:shadow-clay hover:-translate-y-1 transition-all duration-300`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-ink-600/60 bg-white/70 rounded-full px-2 py-0.5">
                {h.cuisine || "recipe"}
              </span>
              {favs.includes(h.slug) && (
                <span className="text-sun-600 text-lg drop-shadow-sm">★</span>
              )}
            </div>
            <div className="font-display text-lg font-bold text-ink-700 leading-snug line-clamp-2 min-h-[3rem]">
              {h.title}
            </div>
            <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-ink-600/60">
              <span>⏱</span>
              <span>{timeAgo(h.viewedAt)}</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
