/**
 * Parse a canonical cache/slug key back into its parts.
 *
 * Forward: buildCacheKey(["chicken","garlic","rice"], {cuisine:"indian", diet:"keto"})
 *          → "chicken-garlic-rice--indian--keto"
 *
 * Reverse: parseSlug("chicken-garlic-rice--indian--keto")
 *          → { ingredients: ["chicken","garlic","rice"], variants: ["indian","keto"] }
 *
 * Variant matching against the keyword dictionaries tells us which variants
 * are cuisines vs. diets.
 */

import keywords from "@/public/data/keywords.json";

export type ParsedSlug = {
  ingredients: string[];
  cuisine: string | null;
  diet: string | null;
  variants: string[];
};

const CUISINES = new Set(Object.keys(keywords.cuisines));
const DIETS = new Set(Object.keys(keywords.diets));

export function parseSlug(slug: string): ParsedSlug {
  const [base, ...variants] = slug.split("--");
  const ingredients = base.split("-").filter(Boolean);
  let cuisine: string | null = null;
  let diet: string | null = null;
  for (const v of variants) {
    if (CUISINES.has(v) && !cuisine) cuisine = v;
    else if (DIETS.has(v) && !diet) diet = v;
  }
  return { ingredients, cuisine, diet, variants };
}
