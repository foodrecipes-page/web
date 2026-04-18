"use client";

import { useEffect, useRef } from "react";
import { GeneratorForm } from "./GeneratorForm";

// Short, punchy labels for tight mobile chips; query is the full prompt sent to the form.
const POPULAR_QUERIES: { icon: string; label: string; query: string }[] = [
  { icon: "🍗", label: "Quick chicken", query: "quick chicken dinner under 30 min" },
  { icon: "🥑", label: "Keto breakfast", query: "keto high-protein breakfast" },
  { icon: "🌱", label: "Vegan curry", query: "vegan indian curry with chickpeas" },
  { icon: "🍝", label: "GF pasta", query: "gluten-free italian pasta" },
  { icon: "🍚", label: "Fried rice", query: "leftover rice fried rice" },
  { icon: "🫓", label: "S. Indian", query: "south indian breakfast" },
];

export function MobileDock({
  defaultCuisine,
  country,
}: {
  defaultCuisine: string | null;
  country: string;
}) {
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const setVar = () =>
      document.documentElement.style.setProperty("--mdock", `${el.offsetHeight}px`);
    setVar();
    const ro = new ResizeObserver(setVar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--mdock", "0px");
    };
  }, []);

  return (
    <div
      className="md:hidden fixed inset-x-0 z-40"
      style={{ bottom: "var(--kb, 0px)" }}
    >
      {/* Soft top fade so scrolling content melts into the dock */}
      <div
        aria-hidden
        className="h-4 bg-gradient-to-t from-cream-50 to-transparent pointer-events-none"
      />

      <div
        ref={innerRef}
        className="
          bg-white/95 backdrop-blur-xl
          border-t-2 border-brand-100
          shadow-[0_-12px_40px_-12px_rgba(210,54,10,0.25)]
          px-3 pt-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]
        "
      >
        {/* Try chips — tight grid, short labels, 3 per row, utilising full width */}
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-600/50">
              ✨ Try one of these
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {POPULAR_QUERIES.map((q) => (
              <a
                key={q.query}
                href={`/?q=${encodeURIComponent(q.query)}`}
                className="clay-btn flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-full bg-white border-2 border-brand-100 text-ink-600 shadow-clay-sm active:translate-y-0.5 truncate"
              >
                <span className="text-sm leading-none">{q.icon}</span>
                <span className="truncate">{q.label}</span>
              </a>
            ))}
          </div>
        </div>

        <GeneratorForm defaultCuisine={defaultCuisine} country={country} bare />
      </div>
    </div>
  );
}
