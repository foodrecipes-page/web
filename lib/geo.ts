import type { NextRequest } from "next/server";
import type { Hints } from "./hints";

const COOKIE = "frp_hints";

/** Map a 2-letter country code to a default cuisine. */
export const COUNTRY_CUISINE: Record<string, string> = {
  IN: "indian",
  US: "american",
  GB: "uk",
  UK: "uk",
  IT: "italian",
  FR: "french",
  DE: "german",
  ES: "spanish",
  JP: "japanese",
  KR: "korean",
  CN: "chinese",
  TH: "thai",
  VN: "vietnamese",
  MX: "mexican",
  GR: "mediterranean",
  TR: "middle-eastern",
};

export const COUNTRY_LABEL: Record<string, string> = {
  IN: "India",
  US: "United States",
  GB: "United Kingdom",
  IT: "Italy",
  FR: "France",
  DE: "Germany",
  ES: "Spain",
  JP: "Japan",
  KR: "Korea",
  CN: "China",
  TH: "Thailand",
  VN: "Vietnam",
  MX: "Mexico",
  GR: "Greece",
  TR: "Türkiye",
};

function b64decode<T>(s: string): T | null {
  try {
    return JSON.parse(Buffer.from(s, "base64").toString("utf-8")) as T;
  } catch {
    return null;
  }
}

/** Server-side read of hints cookie from a Next request. */
export function readHintsServer(req: NextRequest | Request): Hints {
  const cookie = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!cookie) return { v: 1 };
  const raw = cookie.slice(COOKIE.length + 1);
  const [version, payload] = raw.split(".");
  if (version !== "v1" || !payload) return { v: 1 };
  return b64decode<Hints>(payload) || { v: 1 };
}

/** Read country from Vercel geo headers (free, no external call). */
export function readCountry(req: NextRequest | Request): string {
  const h = req.headers;
  return (
    h.get("x-vercel-ip-country") ||
    h.get("cf-ipcountry") ||
    h.get("x-country") ||
    ""
  ).toUpperCase();
}

export function defaultCuisineFor(country: string): string | null {
  return COUNTRY_CUISINE[country] || null;
}
