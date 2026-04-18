"use client";

export type Hints = {
  c?: string | null; // country
  cuisine?: string | null;
  diet?: string | null;
  units?: "metric" | "imperial";
  lang?: string;
  r?: string[]; // recent slugs (max 5)
  v: 1;
};

const COOKIE = "frp_hints";
const LS_HISTORY = "frp_history";
const LS_FAVORITES = "frp_favorites";

function b64encode(obj: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}
function b64decode<T>(s: string): T | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s)))) as T;
  } catch {
    return null;
  }
}

export function readHintsClient(): Hints {
  if (typeof document === "undefined") return { v: 1 };
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (!match) return { v: 1 };
  const [version, payload] = match[1].split(".");
  if (version !== "v1" || !payload) return { v: 1 };
  return b64decode<Hints>(payload) || { v: 1 };
}

export function writeHints(h: Hints): void {
  if (typeof document === "undefined") return;
  const payload = `v1.${b64encode({ ...h, v: 1 })}`;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE}=${payload}; Max-Age=${oneYear}; Path=/; SameSite=Lax; Secure`;
}

export function pushRecent(slug: string): void {
  const h = readHintsClient();
  const r = (h.r || []).filter((s) => s !== slug);
  r.unshift(slug);
  writeHints({ ...h, r: r.slice(0, 5) });
}

// ---- LocalStorage history (richer) ----

export type HistoryEntry = {
  slug: string;
  title: string;
  viewedAt: number;
  cuisine?: string | null;
};

export function getHistory(): HistoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");
  } catch {
    return [];
  }
}

export function addToHistory(entry: HistoryEntry): void {
  if (typeof localStorage === "undefined") return;
  const list = getHistory().filter((e) => e.slug !== entry.slug);
  list.unshift(entry);
  localStorage.setItem(LS_HISTORY, JSON.stringify(list.slice(0, 200)));
}

export function getFavorites(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_FAVORITES) || "[]");
  } catch {
    return [];
  }
}

export function toggleFavorite(slug: string): boolean {
  const favs = getFavorites();
  const idx = favs.indexOf(slug);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.unshift(slug);
  localStorage.setItem(LS_FAVORITES, JSON.stringify(favs.slice(0, 100)));
  return idx < 0; // true = added
}
