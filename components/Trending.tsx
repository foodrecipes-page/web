// Hand-curated "trending" cravings for the landing page. Each links to the
// generator with a prefilled query so the user can tweak + cook in one tap.
const TRENDING: {
  icon: string;
  title: string;
  hook: string;
  query: string;
  tint: "brand" | "herb" | "sun" | "blueberry";
}[] = [
  {
    icon: "🍜",
    title: "Weeknight ramen",
    hook: "Ready in 20 min, feels takeout-good",
    query: "quick weeknight ramen with soft egg under 20 min",
    tint: "brand",
  },
  {
    icon: "🥘",
    title: "One-pot pasta",
    hook: "Dinner + dishes, minus the dishes",
    query: "creamy one-pot pasta with garlic and spinach",
    tint: "herb",
  },
  {
    icon: "🌯",
    title: "Chicken burrito bowl",
    hook: "Meal-prep friendly, 500 cal",
    query: "high-protein chicken burrito bowl under 500 calories",
    tint: "sun",
  },
  {
    icon: "🥗",
    title: "Mediterranean plate",
    hook: "No cooking. Fresh. Done.",
    query: "mediterranean bowl with hummus and feta no cook",
    tint: "blueberry",
  },
  {
    icon: "🍛",
    title: "Dal tadka",
    hook: "Pantry-only, soul food",
    query: "quick dal tadka with rice from pantry",
    tint: "brand",
  },
  {
    icon: "🍳",
    title: "Shakshuka",
    hook: "Breakfast-for-dinner energy",
    query: "classic shakshuka with crusty bread",
    tint: "herb",
  },
];

const TINT_CLASSES: Record<string, string> = {
  brand: "from-brand-100 to-brand-50 border-brand-200",
  herb: "from-herb-100 to-herb-50 border-herb-300/40",
  sun: "from-sun-100 to-sun-50 border-sun-300/50",
  blueberry: "from-blueberry-100 to-blueberry-50 border-blueberry-400/30",
};

const ICON_BG: Record<string, string> = {
  brand: "bg-gradient-to-br from-brand-400 to-brand-600",
  herb: "bg-gradient-to-br from-herb-500 to-herb-700",
  sun: "bg-gradient-to-br from-sun-400 to-sun-600",
  blueberry: "bg-gradient-to-br from-blueberry-500 to-blueberry-700",
};

export function Trending() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 md:gap-4">
      {TRENDING.map((t) => (
        <a
          key={t.query}
          href={`/?q=${encodeURIComponent(t.query)}#compose`}
          className={`rounded-2xl md:rounded-3xl bg-gradient-to-br ${TINT_CLASSES[t.tint]} border-2 p-3 md:p-5 shadow-clay-sm hover:shadow-clay hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 block`}
        >
          <div
            className={`w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl ${ICON_BG[t.tint]} flex items-center justify-center text-lg md:text-2xl shadow-clay-sm mb-2 md:mb-3`}
          >
            <span>{t.icon}</span>
          </div>
          <div className="font-display text-sm md:text-lg font-bold text-ink-700 leading-tight">
            {t.title}
          </div>
          <div className="mt-0.5 md:mt-1 text-[11px] md:text-[13px] text-ink-600/70 leading-snug">
            {t.hook}
          </div>
        </a>
      ))}
    </div>
  );
}
