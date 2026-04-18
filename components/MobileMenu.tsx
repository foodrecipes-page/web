"use client";

import { useEffect, useState } from "react";

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="md:hidden clay-btn inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white border-2 border-brand-100 text-ink-700 shadow-clay-sm active:translate-y-0.5"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-50 bg-ink-700/40 backdrop-blur-sm animate-in fade-in"
        />
      )}

      {/* Drawer */}
      <aside
        className={`md:hidden fixed top-0 right-0 bottom-0 z-50 w-[82%] max-w-xs bg-cream-50 shadow-2xl border-l-2 border-brand-100 transform transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-brand-100">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-clay text-white">🍳</span>
            <span className="font-display text-base font-bold text-ink-700">Menu</span>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="clay-btn inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border-2 border-brand-100 text-ink-700 shadow-clay-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="px-3 py-3 flex flex-col gap-1">
          {[
            { href: "/", icon: "🏠", label: "Home", desc: "Generate a recipe" },
            { href: "/recipes", icon: "📖", label: "Browse", desc: "Recent recipes" },
            { href: "/about", icon: "✨", label: "How it works", desc: "Cache + AI fallback" },
            { href: "/privacy", icon: "🔒", label: "Privacy", desc: "No tracking, ever" },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border-2 border-brand-100 shadow-clay-sm active:translate-y-0.5 transition"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-lg">
                {l.icon}
              </span>
              <span className="flex-1">
                <span className="block font-display text-sm font-bold text-ink-700 leading-tight">{l.label}</span>
                <span className="block text-[11px] text-ink-600/70">{l.desc}</span>
              </span>
              <span className="text-ink-600/40 text-sm">›</span>
            </a>
          ))}
        </nav>

        <div className="px-4 mt-2">
          <div className="rounded-xl bg-gradient-to-br from-sun-100 to-brand-100 border-2 border-brand-100 p-3 shadow-clay-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600">Why we&apos;re different</div>
            <ul className="mt-1.5 text-[12px] text-ink-700 font-medium space-y-1">
              <li>⚡ Instant when cached</li>
              <li>🔒 No tracking, no ads</li>
              <li>💸 Free forever</li>
              <li>🌍 Open recipe cache</li>
            </ul>
          </div>
        </div>

        <div className="absolute bottom-0 inset-x-0 px-4 py-3 border-t-2 border-brand-100 bg-white/70 backdrop-blur">
          <p className="text-[11px] text-ink-600/70 text-center">
            Cooked with ❤️ for the open web
          </p>
        </div>
      </aside>
    </>
  );
}
