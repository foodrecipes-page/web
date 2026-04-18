import keywords from "@/public/data/keywords.json";

export type ParsedIntent = {
  cuisine: string | null;
  diet: string | null;
  meal: string | null;
  dish: string | null;
  protein: string | null;
  time: string | null;
  ingredients: string[];
  raw: string;
};

type Dict = Record<string, string[]>;

function matchFirst(text: string, dict: Dict): string | null {
  for (const [key, aliases] of Object.entries(dict)) {
    for (const alias of aliases) {
      if (text.includes(alias)) return key;
    }
  }
  return null;
}

const STOPWORDS = new Set([
  "a", "an", "the", "with", "and", "or", "some", "for", "of", "in", "on",
  "recipe", "recipes", "dish", "make", "cook", "please", "i", "want", "need",
  "want", "give", "show", "me", "my", "have", "got", "has", "using", "using",
]);

function extractIngredients(text: string, matched: Set<string>): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s,]/g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    if (matched.has(w)) continue;
    if (w.length < 3) continue;
    out.push(w);
  }
  return Array.from(new Set(out)).sort();
}

export function parseQuery(input: string): ParsedIntent {
  const raw = input.trim();
  const text = ` ${raw.toLowerCase()} `;

  const cuisine = matchFirst(text, keywords.cuisines as Dict);
  const diet = matchFirst(text, keywords.diets as Dict);
  const meal = matchFirst(text, keywords.meals as Dict);
  const dish = matchFirst(text, keywords.dishes as Dict);
  const protein = matchFirst(text, keywords.proteins as Dict);
  const time = matchFirst(text, keywords.times as Dict);

  // Collect matched aliases to strip from ingredient extraction
  const matched = new Set<string>();
  for (const dict of [keywords.cuisines, keywords.diets, keywords.meals, keywords.dishes, keywords.proteins, keywords.times]) {
    for (const aliases of Object.values(dict as Dict)) {
      for (const a of aliases) {
        a.split(/\s+/).forEach((w) => matched.add(w));
      }
    }
  }

  const ingredients = extractIngredients(raw, matched);

  return { cuisine, diet, meal, dish, protein, time, ingredients, raw };
}

/**
 * Normalizes an ingredient list into a deterministic cache key.
 * e.g. ["Chicken", "garlic", "rice"] → "chicken-garlic-rice"
 */
export function buildCacheKey(
  ingredients: string[],
  opts: { cuisine?: string | null; diet?: string | null } = {}
): string {
  const base = Array.from(new Set(ingredients.map((i) => i.toLowerCase().trim())))
    .filter(Boolean)
    .sort()
    .join("-");
  const variants: string[] = [];
  if (opts.cuisine) variants.push(opts.cuisine);
  if (opts.diet) variants.push(opts.diet);
  return variants.length ? `${base}--${variants.sort().join("--")}` : base;
}

export function getShard(key: string): string {
  const first = key[0]?.toLowerCase();
  if (!first || !/[a-z]/.test(first)) return "misc";
  return first;
}
