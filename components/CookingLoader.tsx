"use client";

export function CookingLoader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "pt-4 pb-1" : "py-10"}>
      <div className="relative h-20 flex items-center justify-center">
        <div
          className="absolute left-8 flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blueberry-100 to-blueberry-400/40 shadow-clay-sm text-3xl animate-[jump_1.2s_ease-in-out_infinite]"
          aria-hidden
        >
          🤖
        </div>
        <div
          className="absolute left-1/2 -translate-x-1/2 text-xl animate-[fly_2.4s_ease-in-out_infinite]"
          aria-hidden
        >
          📝
        </div>
        <div
          className="absolute right-8 flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-300/40 shadow-clay-sm text-3xl animate-[bob_1.6s_ease-in-out_infinite]"
          aria-hidden
        >
          👨‍🍳
        </div>
      </div>
      <div className="mt-3 text-center text-xs font-bold uppercase tracking-widest text-ink-600/70">
        <span className="animate-[shimmer_2s_ease-in-out_infinite]">
          measuring spices · chopping · tasting · plating
        </span>
      </div>
      <div className="mt-3 mx-auto max-w-sm h-1.5 rounded-full bg-brand-100/60 overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-sun-300 via-brand-500 to-herb-500 animate-[slide_1.8s_linear_infinite]" />
      </div>
      <style>{`
        @keyframes jump { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-12px) rotate(3deg)} }
        @keyframes bob  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes fly  { 0%{transform:translate(-60px,8px) rotate(-8deg);opacity:0} 15%{opacity:1} 50%{transform:translate(0,-14px) rotate(4deg)} 85%{opacity:1} 100%{transform:translate(60px,8px) rotate(-4deg);opacity:0} }
        @keyframes slide{ 0%{transform:translateX(-120%)} 100%{transform:translateX(320%)} }
        @keyframes shimmer{ 0%,100%{opacity:.55} 50%{opacity:1} }
      `}</style>
    </div>
  );
}
