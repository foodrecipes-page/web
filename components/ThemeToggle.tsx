"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark";
const COOKIE = "frp_theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
}

function currentMode(): Mode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  // Initialize from the SSR-rendered <html class>; dark is the default.
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    // Sync with what the server actually rendered (cookie-driven).
    const fromCookie = readCookie(COOKIE) as Mode | null;
    const initial: Mode = fromCookie ?? currentMode();
    setMode(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    writeCookie(COOKIE, next);
  }

  const isDark = mode === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className="clay-btn inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white border-2 border-brand-100 text-ink-700 shadow-clay-sm active:translate-y-0.5"
    >
      <span className="text-base leading-none">{isDark ? "☀️" : "🌙"}</span>
    </button>
  );
}

