export default function PrivacyPage() {
  const items = [
    {
      icon: "🍪",
      label: "Cookie (frp_hints)",
      text: "Remembers your preferred cuisine, diet, and a handful of recently viewed recipe slugs so pages load with relevant content. Not shared with anyone.",
      tint: "bg-brand-100 text-brand-700",
    },
    {
      icon: "💾",
      label: "LocalStorage",
      text: "Stores your full recipe history and favorites on your device only. We never send it anywhere.",
      tint: "bg-herb-100 text-herb-700",
    },
    {
      icon: "🌍",
      label: "Country",
      text: "Derived from your IP via Vercel's request headers (no external call, no storage) to pick a sensible default cuisine.",
      tint: "bg-sun-100 text-sun-600",
    },
    {
      icon: "📖",
      label: "Generated recipes",
      text: "Published publicly in our open GitHub cache so the whole internet benefits. They do not include anything that identifies you.",
      tint: "bg-blueberry-100 text-blueberry-600",
    },
    {
      icon: "🔌",
      label: "Third parties",
      text: "AI providers (Groq, Gemini, etc.) receive the ingredient list when we need to generate a new recipe. They do not receive your identity.",
      tint: "bg-brand-100 text-brand-700",
    },
  ];

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="text-center mb-8">
        <div className="inline-block rounded-full bg-herb-100 text-herb-700 text-[10px] font-bold uppercase tracking-widest px-3 py-1 shadow-clay-sm">
          🔒 Privacy
        </div>
        <h1 className="mt-3 font-display text-4xl md:text-5xl font-black text-ink-700">
          We keep this short
        </h1>
        <p className="mt-3 text-ink-600/80">
          No trackers, no ads, no dark patterns. Here&apos;s every bit of data we touch.
        </p>
      </div>

      <div className="space-y-4">
        {items.map((it) => (
          <div key={it.label} className="clay-surface rounded-3xl p-5 md:p-6 flex gap-4">
            <div
              className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-clay-sm ${it.tint}`}
            >
              {it.icon}
            </div>
            <div>
              <div className="font-display text-lg font-bold text-ink-700">{it.label}</div>
              <p className="mt-1 text-sm text-ink-600/80 leading-relaxed">{it.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
