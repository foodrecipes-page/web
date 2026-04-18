export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="text-center mb-8">
        <div className="inline-block rounded-full bg-brand-100 text-brand-600 text-[10px] font-bold uppercase tracking-widest px-3 py-1 shadow-clay-sm">
          🍳 About
        </div>
        <h1 className="mt-3 font-display text-4xl md:text-5xl font-black text-ink-700">
          The honest recipe site
        </h1>
        <p className="mt-3 text-ink-600/80">
          A recipe site that tries really hard not to cost you anything and not to waste anyone&apos;s time.
        </p>
      </div>

      <div className="clay-surface rounded-3xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center shadow-clay text-xl">⚙️</span>
          <h2 className="font-display text-2xl font-bold text-ink-700">How it works</h2>
        </div>
        <ul className="space-y-3">
          {[
            ["🗂️", "Recipes are cached publicly on GitHub and served via jsDelivr CDN — instant and free."],
            ["🤖", "If a recipe isn't cached yet, we ask open AI models (Groq, Gemini, Cerebras, OpenRouter) to generate one."],
            ["🌱", "Every new recipe joins the public cache so the next person gets it instantly."],
          ].map(([i, t]) => (
            <li key={t} className="flex gap-3 items-start">
              <span className="shrink-0 w-9 h-9 rounded-xl bg-white border-2 border-brand-100 flex items-center justify-center text-lg shadow-clay-sm">
                {i}
              </span>
              <span className="text-ink-600/90 leading-relaxed pt-1">{t}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 clay-surface rounded-3xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-herb-500 to-herb-700 text-white flex items-center justify-center shadow-clay-herb text-xl">🔒</span>
          <h2 className="font-display text-2xl font-bold text-ink-700">Your data</h2>
        </div>
        <p className="text-ink-600/90 leading-relaxed">
          We store your preferences in a cookie on your device and your history in your
          browser&apos;s local storage. Nothing leaves your device unless you explicitly share a recipe.
        </p>
        <a
          href="/privacy"
          className="clay-btn mt-4 inline-flex items-center gap-1 text-sm font-bold text-herb-700 hover:text-herb-600"
        >
          Read the privacy details →
        </a>
      </div>
    </div>
  );
}
