"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TASTES, type Taste } from "./TastePicker";

type Category = {
  key: "cuisine" | "protein" | "fruits" | "allergies" | "meal" | "time" | "calories";
  title: string;
  emoji: string;
  multi?: boolean;
  maxMulti?: number;
  options: { emoji: string; label: string; value: string }[];
};

const CATEGORIES: Category[] = [
  {
    key: "cuisine",
    title: "Cuisine",
    emoji: "🌍",
    options: [
      { emoji: "🇮🇳", label: "Indian", value: "indian" },
      { emoji: "🍝", label: "Italian", value: "italian" },
      { emoji: "🌮", label: "Mexican", value: "mexican" },
      { emoji: "🍜", label: "Thai", value: "thai" },
      { emoji: "🥢", label: "Chinese", value: "chinese" },
      { emoji: "🍣", label: "Japanese", value: "japanese" },
      { emoji: "🥙", label: "Mediterranean", value: "mediterranean" },
      { emoji: "🇺🇸", label: "American", value: "american" },
    ],
  },
  {
    key: "protein",
    title: "Protein",
    emoji: "💪",
    options: [
      { emoji: "🍗", label: "Chicken", value: "chicken" },
      { emoji: "🧀", label: "Paneer", value: "paneer" },
      { emoji: "🌱", label: "Tofu", value: "tofu" },
      { emoji: "🐟", label: "Fish", value: "fish" },
      { emoji: "🥚", label: "Eggs", value: "eggs" },
      { emoji: "🫘", label: "Lentils", value: "lentils" },
      { emoji: "🥩", label: "Beef", value: "beef" },
      { emoji: "🍤", label: "Shrimp", value: "shrimp" },
    ],
  },
  {
    key: "fruits",
    title: "Fruits",
    emoji: "🍓",
    multi: true,
    maxMulti: 3,
    options: [
      { emoji: "🍋", label: "Lemon", value: "lemon" },
      { emoji: "🍊", label: "Orange", value: "orange" },
      { emoji: "🍓", label: "Berries", value: "berries" },
      { emoji: "🍌", label: "Banana", value: "banana" },
      { emoji: "🥭", label: "Mango", value: "mango" },
      { emoji: "🍍", label: "Pineapple", value: "pineapple" },
      { emoji: "🍎", label: "Apple", value: "apple" },
      { emoji: "🥥", label: "Coconut", value: "coconut" },
      { emoji: "🥑", label: "Avocado", value: "avocado" },
      { emoji: "🍑", label: "Peach", value: "peach" },
      { emoji: "🍇", label: "Grapes", value: "grapes" },
      { emoji: "🍉", label: "Watermelon", value: "watermelon" },
    ],
  },
  {
    key: "allergies",
    title: "Avoid",
    emoji: "🚫",
    multi: true,
    options: [
      { emoji: "🥜", label: "Nuts", value: "nuts" },
      { emoji: "🥛", label: "Dairy", value: "dairy" },
      { emoji: "🌾", label: "Gluten", value: "gluten" },
      { emoji: "🥚", label: "Eggs", value: "eggs" },
      { emoji: "🦐", label: "Shellfish", value: "shellfish" },
      { emoji: "🫘", label: "Soy", value: "soy" },
      { emoji: "🐟", label: "Fish", value: "fish" },
      { emoji: "🌶️", label: "Spicy", value: "spicy" },
    ],
  },
  {
    key: "meal",
    title: "Meal",
    emoji: "🕒",
    options: [
      { emoji: "🌅", label: "Breakfast", value: "breakfast" },
      { emoji: "☀️", label: "Lunch", value: "lunch" },
      { emoji: "🌙", label: "Dinner", value: "dinner" },
      { emoji: "🍿", label: "Snack", value: "snack" },
    ],
  },
  {
    key: "time",
    title: "Time",
    emoji: "⏱",
    options: [
      { emoji: "⚡", label: "Under 15 min", value: "under 15 minutes" },
      { emoji: "⏲", label: "30 min", value: "around 30 minutes" },
      { emoji: "🕰", label: "1 hour", value: "about an hour" },
      { emoji: "🍲", label: "Slow cook", value: "slow-cooked" },
    ],
  },
  {
    key: "calories",
    title: "Calories",
    emoji: "🔥",
    options: [
      { emoji: "🪶", label: "Light (<400)", value: "under 400 calories" },
      { emoji: "⚖️", label: "Medium (400–600)", value: "around 400 to 600 calories" },
      { emoji: "💪", label: "Hearty (600–800)", value: "around 600 to 800 calories" },
      { emoji: "🍖", label: "Big (>800)", value: "over 800 calories" },
    ],
  },
];

type Selections = Partial<Record<Category["key"], string[]>>;

const MAX_VIBES = 2;

export function TasteWizard({
  open,
  seed,
  onClose,
}: {
  readonly open: boolean;
  readonly seed: Taste | null;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Selections>({});
  // Local vibes — up to 2. Starts from whatever the caller seeded.
  const [activeSeeds, setActiveSeeds] = useState<Taste[]>(seed ? [seed] : []);
  // Desktop stepper: 0 = Vibe, 1..N = categories. Mobile shows everything stacked.
  const [step, setStep] = useState(0);
  const TOTAL_STEPS = 1 + CATEGORIES.length;
  const isLastStep = step === TOTAL_STEPS - 1;
  const [pregenSlug, setPregenSlug] = useState<string | null>(null);
  const [pregenState, setPregenState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const pregenSeqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state whenever the wizard re-opens with a (possibly new) seed.
  useEffect(() => {
    if (!open) return;
    setSel({});
    setPregenSlug(null);
    setPregenState("idle");
    setActiveSeeds(seed ? [seed] : []);
    setStep(0);
  }, [open, seed]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filledCount = useMemo(
    () => Object.values(sel).filter((v) => v && v.length > 0).length,
    [sel]
  );

  const vibeLabel = useMemo(() => {
    if (activeSeeds.length === 0) return "";
    if (activeSeeds.length === 1) return activeSeeds[0].label.toLowerCase();
    return activeSeeds.map((v) => v.label.toLowerCase()).join(" + ");
  }, [activeSeeds]);

  const queryPreview = useMemo(() => {
    if (activeSeeds.length === 0) return "";
    const bits: string[] = [vibeLabel];
    if (sel.meal?.[0]) bits.push(sel.meal[0]);
    if (sel.cuisine?.[0]) bits.push(sel.cuisine[0]);
    if (sel.protein?.[0]) bits.push(`with ${sel.protein[0]}`);
    if (sel.fruits && sel.fruits.length > 0) bits.push(`featuring ${sel.fruits.join(" & ")}`);
    if (sel.time?.[0]) bits.push(sel.time[0]);
    if (sel.calories?.[0]) bits.push(sel.calories[0]);
    if (sel.allergies && sel.allergies.length > 0) bits.push(`no ${sel.allergies.join("/")}`);
    return bits.join(" · ");
  }, [activeSeeds, sel, vibeLabel]);

  const apiBody = useMemo(() => {
    if (activeSeeds.length === 0) return null;
    // Build a rich free-text prompt.
    const parts: string[] = [`something ${vibeLabel}`];
    if (sel.meal?.[0]) parts.push(`for ${sel.meal[0]}`);
    if (sel.time?.[0]) parts.push(sel.time[0]);
    if (sel.calories?.[0]) parts.push(sel.calories[0]);
    if (sel.allergies && sel.allergies.length > 0) {
      parts.push(`avoid ${sel.allergies.join(", ")}`);
    }
    const raw = parts.join(" ");
    // Synthesize an ingredient list from vibes + protein + fruits.
    const ingredients: string[] = activeSeeds.map((v) => v.label.toLowerCase());
    if (sel.protein?.[0]) ingredients.push(sel.protein[0]);
    if (sel.fruits) ingredients.push(...sel.fruits);
    return {
      ingredients,
      cuisine: sel.cuisine?.[0] ?? null,
      diet: sel.allergies && sel.allergies.length > 0 ? `avoid ${sel.allergies.join(", ")}` : null,
      meal: sel.meal?.[0] ?? null,
      dish: null,
      raw,
    };
  }, [activeSeeds, sel, vibeLabel]);

  // Background pre-generation: debounce 600ms after selection changes.
  useEffect(() => {
    if (!open || !apiBody) return;
    // Require at least one secondary pick before spending API credits.
    if (filledCount === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const seq = ++pregenSeqRef.current;
      setPregenState("loading");
      setPregenSlug(null);
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiBody),
        });
        if (seq !== pregenSeqRef.current) return; // stale
        if (!res.ok) {
          setPregenState("error");
          return;
        }
        const data = await res.json();
        if (data.slug) {
          setPregenSlug(data.slug);
          setPregenState("ready");
        } else {
          setPregenState("error");
        }
      } catch {
        if (seq !== pregenSeqRef.current) return;
        setPregenState("error");
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [apiBody, open, sel]);

  function advance() {
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }

  function isSelected(cat: Category["key"], value: string) {
    return (sel[cat] ?? []).includes(value);
  }

  function pick(catDef: Category, value: string) {
    const key = catDef.key;
    const current = sel[key] ?? [];
    const already = current.includes(value);
    let next: string[];
    if (catDef.multi) {
      if (already) {
        next = current.filter((v) => v !== value);
      } else {
        const cap = catDef.maxMulti ?? Infinity;
        next = current.length >= cap ? [...current.slice(1), value] : [...current, value];
      }
    } else {
      next = already ? [] : [value];
    }
    setSel((s) => ({ ...s, [key]: next.length > 0 ? next : undefined }));
    // Auto-advance only for single-select on a fresh pick.
    if (!catDef.multi && !already) {
      requestAnimationFrame(() => advance());
    }
  }

  function pickVibe(t: Taste) {
    setActiveSeeds((prev) => {
      const already = prev.some((v) => v.label === t.label);
      let next: Taste[];
      if (already) {
        next = prev.filter((v) => v.label !== t.label);
      } else if (prev.length >= MAX_VIBES) {
        next = [...prev.slice(1), t];
      } else {
        next = [...prev, t];
      }
      // Auto-advance only when we reach max vibes (fresh pick).
      if (!already && next.length === MAX_VIBES) {
        requestAnimationFrame(() => advance());
      }
      return next;
    });
  }

  async function onGenerate() {
    if (!apiBody) return;
    // If pregen already resolved, jump there instantly.
    if (pregenState === "ready" && pregenSlug) {
      router.push(`/recipe/${pregenSlug}`);
      onClose();
      return;
    }
    // Otherwise fire now and wait.
    setPregenState("loading");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
      });
      if (!res.ok) {
        setPregenState("error");
        return;
      }
      const data = await res.json();
      if (data.slug) {
        router.push(`/recipe/${data.slug}`);
        onClose();
      }
    } catch {
      setPregenState("error");
    }
  }

  if (!open || activeSeeds.length === 0) return null;

  const primarySeed = activeSeeds[0];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center md:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Build a ${primarySeed.label.toLowerCase()} recipe`}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      {/* Sheet */}
      <div className="relative w-full md:max-w-2xl md:mx-4 clay-surface rounded-t-[2rem] md:rounded-[2rem] overflow-hidden flex flex-col max-h-[92vh] md:max-h-[85vh]">
        {/* Grab handle on mobile */}
        <div className="md:hidden flex justify-center pt-2">
          <div className="w-10 h-1 rounded-full bg-ink-600/20" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-4 md:px-8 md:pt-6 md:pb-5 relative">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-sun-300 to-brand-400 flex items-center justify-center text-2xl md:text-3xl shadow-clay">
              {activeSeeds.length > 1 ? (
                <span className="flex items-center -space-x-1">
                  {activeSeeds.map((v) => (
                    <span key={v.label}>{v.emoji}</span>
                  ))}
                </span>
              ) : (
                primarySeed.emoji
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600">
                Hey, it&apos;s me 👋
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-black text-ink-700 leading-tight">
                So… what are we eating?
              </h2>
              <p className="mt-0.5 text-[12px] md:text-sm text-ink-600/70">
                {filledCount > 0 || activeSeeds.length > 1 ? (
                  <>
                    You said{" "}
                    <span className="font-semibold text-ink-700 lowercase">{vibeLabel}</span>
                    {" "}— nice, let&apos;s keep going.
                  </>
                ) : (
                  <>Tell me a bit more and I&apos;ll cook something you&apos;ll love.</>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="clay-btn shrink-0 w-9 h-9 rounded-xl bg-white border-2 border-brand-100 text-ink-600 shadow-clay-sm active:translate-y-0.5 flex items-center justify-center"
            >
              <span className="text-base leading-none">✕</span>
            </button>
          </div>

          {queryPreview && (
            <p className="mt-3 text-[12px] md:text-sm text-ink-600/70 truncate">
              <span className="font-bold text-ink-700">Cooking:</span> {queryPreview}
            </p>
          )}

          {/* Live selection summary chips */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {activeSeeds.map((v) => (
              <span
                key={v.label}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2.5 py-1 text-[11px] font-bold text-brand-700"
              >
                <span>✨</span>
                <span className="uppercase tracking-wider text-[9px] text-brand-600/70">Vibe</span>
                <span className="text-base leading-none">{v.emoji}</span>
                <span>{v.label}</span>
              </span>
            ))}
            {CATEGORIES.flatMap((cat) => {
              const values = sel[cat.key] ?? [];
              return values.map((val) => {
                const opt = cat.options.find((o) => o.value === val);
                if (!opt) return null;
                const isAvoid = cat.key === "allergies";
                const chipClass = isAvoid
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-herb-50 border-herb-200 text-herb-700";
                const labelClass = isAvoid ? "text-red-700/70" : "text-herb-700/70";
                return (
                  <span
                    key={`${cat.key}-${val}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${chipClass}`}
                  >
                    <span>{cat.emoji}</span>
                    <span className={`uppercase tracking-wider text-[9px] ${labelClass}`}>
                      {cat.title}
                    </span>
                    <span className="text-base leading-none">{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </span>
                );
              });
            })}
          </div>

          {/* Desktop stepper progress pills */}
          <div className="hidden md:flex items-center gap-1.5 mt-4 flex-wrap">
            {["✨ Vibe", ...CATEGORIES.map((c) => `${c.emoji} ${c.title}`)].map((label, i) => {
              const isCurrent = i === step;
              const isDone = i < step;
              let pillClass = "bg-white text-ink-600/50 border-ink-600/10 hover:border-brand-200";
              if (isCurrent) pillClass = "bg-brand-500 text-white border-brand-500";
              else if (isDone) pillClass = "bg-brand-50 text-brand-700 border-brand-200";
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border-2 transition-all ${pillClass}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable question sections — all visible on mobile, one-at-a-time on desktop */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 md:px-8 pb-4">
          <div key={`step-${step}`} className="md:animate-step-in">
            {/* Vibe section (step 0) */}
            <div className={`mb-5 ${step === 0 ? "md:block" : "md:hidden"}`}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-sm">✨</span>
                <span className="text-[11px] md:text-xs font-bold uppercase tracking-widest text-ink-600/60">
                  Pick 1 or 2 vibes
                </span>
                <span className="text-[10px] text-ink-600/40">
                  {activeSeeds.length}/{MAX_VIBES}
                </span>
                {activeSeeds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveSeeds([])}
                    className="ml-auto text-[10px] font-bold text-brand-600 hover:text-brand-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-2">
                {TASTES.map((t) => {
                  const active = activeSeeds.some((v) => v.label === t.label);
                  return (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => pickVibe(t)}
                      aria-pressed={active}
                      className={`clay-btn flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] md:text-sm font-semibold border-2 transition-all ${
                        active
                          ? "bg-gradient-to-br from-brand-400 to-brand-600 text-white border-brand-500 shadow-clay"
                          : "bg-white text-ink-700 border-brand-100 hover:border-brand-300 shadow-clay-sm"
                      }`}
                    >
                      <span className="text-base leading-none">{t.emoji}</span>
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {CATEGORIES.map((cat, i) => {
              const values = sel[cat.key] ?? [];
              return (
                <div
                  key={cat.key}
                  className={`mb-5 last:mb-2 ${step === i + 1 ? "md:block" : "md:hidden"}`}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">{cat.emoji}</span>
                    <span className="text-[11px] md:text-xs font-bold uppercase tracking-widest text-ink-600/60">
                      {cat.title}
                      {cat.multi && cat.key === "allergies" && (
                        <span className="ml-1 normal-case tracking-normal text-ink-600/50 font-normal">
                          (pick any to avoid)
                        </span>
                      )}
                      {cat.multi && cat.key === "fruits" && (
                        <span className="ml-1 normal-case tracking-normal text-ink-600/50 font-normal">
                          (pick up to {cat.maxMulti})
                        </span>
                      )}
                    </span>
                    {values.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSel((s) => ({ ...s, [cat.key]: undefined }))}
                        className="ml-auto text-[10px] font-bold text-brand-600 hover:text-brand-700"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2">
                    {cat.options.map((opt) => {
                      const active = isSelected(cat.key, opt.value);
                      const activeTone =
                        cat.key === "allergies"
                          ? "bg-gradient-to-br from-red-400 to-red-600 text-white border-red-500 shadow-clay"
                          : "bg-gradient-to-br from-brand-400 to-brand-600 text-white border-brand-500 shadow-clay";
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => pick(cat, opt.value)}
                          aria-pressed={active}
                          className={`clay-btn flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] md:text-sm font-semibold border-2 transition-all ${
                            active
                              ? activeTone
                              : "bg-white text-ink-700 border-brand-100 hover:border-brand-300 shadow-clay-sm"
                          }`}
                        >
                          <span className="text-base leading-none">{opt.emoji}</span>
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sticky footer — Generate button */}
        <div className="border-t-2 border-brand-100 bg-white/95 backdrop-blur px-5 md:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between mb-2 text-[11px] font-semibold">
            {pregenState === "ready" && (
              <span className="inline-flex items-center gap-1.5 text-herb-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-herb-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-herb-500" />
                </span>
                Recipe ready — tap to open
              </span>
            )}
            {pregenState === "loading" && (
              <span className="inline-flex items-center gap-1.5 text-ink-600/70">
                <span className="animate-spin inline-block w-3 h-3 border-2 border-brand-300 border-t-brand-600 rounded-full" />
                Cooking up a preview…
              </span>
            )}
            {pregenState === "idle" && (
              <span className="text-ink-600/50">Pick a few to preview a recipe.</span>
            )}
            {pregenState === "error" && (
              <span className="text-red-600">Preview failed — tap Generate to retry.</span>
            )}
            <span className="text-ink-600/40 ml-auto">Esc to close</span>
          </div>
          {/* Mobile footer: single Generate button */}
          <button
            type="button"
            onClick={onGenerate}
            disabled={pregenState === "loading"}
            className="md:hidden clay-btn w-full rounded-xl bg-gradient-to-br from-sun-500 via-brand-400 to-brand-500 hover:from-sun-600 hover:to-brand-600 disabled:opacity-70 text-white font-bold shadow-clay-sun hover:-translate-y-0.5 active:translate-y-0 transition-all h-12 flex items-center justify-center gap-2"
          >
            <span className="text-lg">🍳</span>
            <span className="text-sm md:text-base">
              {pregenState === "ready" ? "Open My Recipe" : "Generate My Recipe"}
            </span>
            <span className="text-lg">→</span>
          </button>

          {/* Desktop footer: stepper controls */}
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="clay-btn rounded-xl px-4 h-12 bg-white text-ink-700 font-bold border-2 border-ink-600/10 hover:border-brand-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              ← Back
            </button>
            {!isLastStep && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
                className="clay-btn rounded-xl px-4 h-12 bg-white text-ink-600 font-semibold border-2 border-dashed border-ink-600/15 hover:border-brand-200 hover:text-ink-700 transition-all"
              >
                Skip
              </button>
            )}
            <div className="flex-1" />
            {isLastStep ? (
              <button
                type="button"
                onClick={onGenerate}
                disabled={pregenState === "loading"}
                className="clay-btn rounded-xl bg-gradient-to-br from-sun-500 via-brand-400 to-brand-500 hover:from-sun-600 hover:to-brand-600 disabled:opacity-70 text-white font-bold shadow-clay-sun hover:-translate-y-0.5 active:translate-y-0 transition-all h-12 px-6 flex items-center justify-center gap-2"
              >
                <span className="text-lg">🍳</span>
                <span>
                  {pregenState === "ready" ? "Open My Recipe" : "Generate My Recipe"}
                </span>
                <span className="text-lg">→</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
                className="clay-btn rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 hover:from-brand-500 hover:to-brand-700 text-white font-bold shadow-clay hover:-translate-y-0.5 active:translate-y-0 transition-all h-12 px-6 flex items-center justify-center gap-2"
              >
                <span>Next</span>
                <span className="text-lg">→</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
