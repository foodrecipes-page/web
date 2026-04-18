export default function Loading() {
  return (
    <div className="max-w-xl mx-auto py-10 md:py-16 px-4">
      <div className="clay-surface rounded-[2rem] p-8 md:p-10 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-10 -left-10 w-40 h-40 bg-brand-300 opacity-25 blur-2xl"
          style={{ borderRadius: "42% 58% 62% 38% / 50% 42% 58% 50%" }}
        />
        <div
          aria-hidden
          className="absolute -bottom-10 -right-10 w-48 h-48 bg-herb-300 opacity-25 blur-2xl"
          style={{ borderRadius: "58% 42% 38% 62% / 42% 58% 50% 50%" }}
        />

        <div className="relative">
          {/* Bot → Chef scene */}
          <div className="relative h-32 flex items-center justify-center">
            <div
              className="absolute left-4 flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blueberry-100 to-blueberry-400/40 shadow-clay text-4xl animate-[jump_1.2s_ease-in-out_infinite]"
              aria-hidden
            >
              🤖
            </div>
            <div
              className="absolute left-1/2 -translate-x-1/2 text-2xl animate-[fly_2.4s_ease-in-out_infinite]"
              aria-hidden
            >
              📝
            </div>
            <div
              className="absolute right-4 flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-300/40 shadow-clay text-4xl animate-[bob_1.6s_ease-in-out_infinite]"
              aria-hidden
            >
              👨‍🍳
            </div>
          </div>

          <h1 className="mt-4 text-center font-display text-3xl md:text-4xl font-black text-ink-700">
            Our bot is sprinting to the chef…
          </h1>
          <p className="mt-3 text-center text-ink-600/80">
            Checking the cache first. If it&apos;s not there, a fresh recipe is being
            written by hand (well, by AI) right now.
          </p>

          <div className="mt-8 rounded-2xl bg-cream-50 border-2 border-brand-100 p-4 shadow-clay-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-ink-600/70 animate-[shimmer_2s_ease-in-out_infinite]">
                measuring spices · chopping · tasting · plating
              </span>
            </div>
          </div>

          <div className="mt-5 h-2 rounded-full bg-brand-100/60 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-sun-300 via-brand-500 to-herb-500 animate-[slide_1.8s_linear_infinite]" />
          </div>

          <p className="mt-6 text-center text-xs font-semibold text-ink-600/50">
            Usually takes 2–5 seconds. Served free.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes jump {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50%      { transform: translateY(-18px) rotate(3deg); }
        }
        @keyframes bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes fly {
          0%   { transform: translate(-80px, 10px) rotate(-8deg); opacity: 0; }
          15%  { opacity: 1; }
          50%  { transform: translate(0, -20px) rotate(4deg); }
          85%  { opacity: 1; }
          100% { transform: translate(80px, 10px) rotate(-4deg); opacity: 0; }
        }
        @keyframes slide {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        @keyframes shimmer {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
