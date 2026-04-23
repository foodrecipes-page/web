/**
 * build-ontology.ts
 *
 * Mines vocabulary (NOT recipe content) from downloaded datasets and produces
 * public/data/ontology.json. We extract only facts/terms — no creative
 * expression, no directions text, no author prose. Safe and license-clean.
 *
 * What gets extracted:
 *   - ingredient names (frequency-ranked, deduped, aliased)
 *   - cuisines, sub-regions
 *   - techniques (verbs from instructions, filtered to cooking verbs)
 *   - tags → meals, diets, occasions, flavors
 *
 * Run: tsx scripts/build-ontology.ts
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import * as readline from "node:readline";

const RAW = process.env.RAW_DIR ?? `${process.env.HOME}/frp-datasets`;
const OUT = "public/data/ontology.json";

// ---------- seed vocabularies we maintain by hand (quality floor) ----------
const MANUAL = {
  flavors: [
    "tangy", "spicy", "smoky", "sweet", "sour", "bitter", "umami",
    "savory", "fresh", "rich", "buttery", "nutty", "earthy", "herbal",
    "citrusy", "peppery", "garlicky", "salty", "floral", "fermented",
  ],
  textures: [
    "creamy", "crunchy", "crispy", "chewy", "juicy", "flaky", "silky",
    "velvety", "fluffy", "gooey", "tender", "crumbly", "crisp", "dense", "light",
  ],
  moods: [
    "cozy", "comforting", "energizing", "light", "indulgent", "nostalgic",
    "adventurous", "hangover-cure", "date-night", "monsoon", "festive",
    "quick-fix", "meal-prep", "brunch-mood", "midnight-craving",
    "post-workout", "sick-day", "lazy-sunday", "show-off", "weeknight",
    "one-pot", "crowd-pleaser", "romantic", "kid-friendly", "solo-dinner",
  ],
  diets: [
    "vegetarian", "vegan", "pescatarian", "keto", "paleo", "low-carb",
    "low-fat", "gluten-free", "dairy-free", "nut-free", "egg-free",
    "high-protein", "low-calorie", "diabetic-friendly", "jain", "halal",
    "kosher", "whole30", "mediterranean", "dash", "fodmap", "raw",
    "sugar-free", "low-sodium", "plant-based",
  ],
  meals: [
    "breakfast", "brunch", "lunch", "dinner", "snack", "dessert",
    "appetizer", "side", "beverage", "tiffin", "thali",
    "late-night", "pre-workout", "post-workout",
  ],
  occasions: [
    "weekday", "weekend", "party", "festival", "diwali", "eid", "christmas",
    "thanksgiving", "ramadan", "holi", "ganesh-chaturthi", "onam", "pongal",
    "birthday", "anniversary", "picnic", "barbecue", "potluck", "game-day",
    "date-night", "baby-shower", "bridal-shower", "fasting", "navratri",
  ],
};

// ---------- helpers ----------
const clean = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const freq = new Map<string, number>();
function bump(k: string, n = 1) {
  const c = clean(k);
  if (!c || c.length < 2 || c.length > 40) return;
  freq.set(c, (freq.get(c) ?? 0) + n);
}

const STOP = new Set([
  "the", "a", "an", "of", "and", "or", "to", "for", "with", "in", "on",
  "at", "by", "your", "my", "this", "that", "some", "any", "all", "from",
  "into", "over", "under", "until", "then", "about", "cup", "cups",
  "tsp", "tbsp", "tablespoon", "teaspoon", "ounce", "oz", "pound", "lb",
  "gram", "g", "ml", "pinch", "dash", "to taste", "large", "small", "medium",
  "fresh", "dried", "chopped", "minced", "sliced", "diced", "ground",
  "optional", "other", "recipe", "water", "salt", "pepper",
]);

// ---------- streaming CSV reader (memory-safe on 2M rows) ----------
async function* streamCSV(path: string): AsyncGenerator<string[]> {
  const rl = readline.createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  let header: string[] | null = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    // naive CSV split — good enough for our datasets (fields don't embed commas often);
    // for production, swap in csv-parse. We only need rough tokenization.
    const row = line.split(",").map((s) => s.replace(/^"|"$/g, "").trim());
    if (!header) { header = row; continue; }
    yield row;
  }
}

// ---------- 1. RecipeNLG: ingredient frequency + technique verbs ----------
async function mineRecipeNLG() {
  // Dataset ships as RecipeNLG_dataset.csv (older variants used full_dataset.csv)
  const candidates = [
    join(RAW, "recipenlg/RecipeNLG_dataset.csv"),
    join(RAW, "recipenlg/full_dataset.csv"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) { console.log("   (recipenlg not present — skipping)"); return; }
  console.log(`==> mining RecipeNLG from ${path}...`);
  let rows = 0;
  const techniques = new Map<string, number>();
  const COOK_VERBS = /\b(saute|sear|grill|roast|bake|fry|stir-fry|steam|boil|simmer|poach|braise|broil|smoke|cure|marinate|ferment|pickle|caramelize|reduce|deglaze|whisk|fold|knead|rest|temper|tadka|bhuna|dum)\b/g;
  for await (const row of streamCSV(path)) {
    rows++;
    // columns vary; use last few as instruction text. Index 1 or 2 = NER ingredients string.
    const ingrStr = row[2] ?? row[1] ?? "";
    for (const tok of ingrStr.replace(/[\[\]"']/g, "").split(",")) {
      const c = clean(tok);
      if (!c || STOP.has(c)) continue;
      bump(`ingr:${c}`);
    }
    const instr = row[row.length - 2] ?? "";
    const matches = instr.toLowerCase().match(COOK_VERBS) ?? [];
    for (const v of matches) techniques.set(v, (techniques.get(v) ?? 0) + 1);
    if (rows % 200000 === 0) console.log(`   ${rows.toLocaleString()} rows...`);
  }
  return { techniques };
}

// ---------- 2. Food.com: tags → meals, occasions, flavors ----------
async function mineFoodCom() {
  const path = join(RAW, "food-com/RAW_recipes.csv");
  if (!existsSync(path)) { console.log("   (food.com not present — skipping)"); return; }
  console.log("==> mining Food.com tags...");
  for await (const row of streamCSV(path)) {
    const tagStr = row.find((c) => c.startsWith("[")) ?? "";
    for (const raw of tagStr.replace(/[\[\]"']/g, "").split(",")) {
      const t = clean(raw);
      if (!t || STOP.has(t)) continue;
      bump(`tag:${t}`);
    }
  }
}

// ---------- 3. TheMealDB: canonical cuisine + category lists ----------
async function mineMealDB() {
  const dir = join(RAW, "themealdb");
  if (!existsSync(dir)) { console.log("   (themealdb not present — skipping)"); return; }
  console.log("==> mining TheMealDB taxonomy...");
  const cuisines: string[] = [];
  try {
    const areas = JSON.parse(readFileSync(join(dir, "list.php_a_list.json"), "utf8"));
    for (const a of areas.meals ?? []) if (a.strArea) cuisines.push(clean(a.strArea));
  } catch { /* ignore */ }
  const categories: string[] = [];
  try {
    const cats = JSON.parse(readFileSync(join(dir, "categories.php.json"), "utf8"));
    for (const c of cats.categories ?? []) if (c.strCategory) categories.push(clean(c.strCategory));
  } catch { /* ignore */ }
  const ingredients: string[] = [];
  try {
    const ingr = JSON.parse(readFileSync(join(dir, "list.php_i_list.json"), "utf8"));
    for (const i of ingr.meals ?? []) if (i.strIngredient) ingredients.push(clean(i.strIngredient));
  } catch { /* ignore */ }
  return { cuisines, categories, ingredients };
}

// ---------- 4. USDA Foundation Foods: authoritative ingredient names ----------
function mineUSDA(): string[] {
  const path = join(RAW, "usda/foundation_food.json");
  if (!existsSync(path)) { console.log("   (usda not present — skipping)"); return []; }
  console.log("==> mining USDA Foundation Foods...");
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const foods = data.FoundationFoods ?? data.foundationFoods ?? [];
    const names = new Set<string>();
    for (const f of foods) {
      const desc = (f.description ?? "").toLowerCase();
      if (!desc) continue;
      // Keep only the core food name: "Hummus, commercial" -> "hummus"
      const core = desc.split(",")[0].trim();
      if (core && core.length >= 2 && core.length <= 30) {
        names.add(core.replace(/\s+/g, " "));
      }
    }
    console.log(`   ${names.size} unique USDA ingredient names`);
    return [...names];
  } catch (err) {
    console.log(`   usda parse failed: ${(err as Error).message}`);
    return [];
  }
}

// ---------- main ----------
async function main() {
  const usda = mineUSDA();
  const [nlg, , mealdb] = await Promise.all([
    mineRecipeNLG(),
    mineFoodCom(),
    mineMealDB(),
  ]);

  // Top ingredients (frequency-ranked, min 50 appearances)
  const topIngredients = [...freq.entries()]
    .filter(([k]) => k.startsWith("ingr:"))
    .map(([k, n]) => [k.slice(5), n] as const)
    .filter(([name, n]) => n > 50 && !STOP.has(name) && !/\d/.test(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3000)
    .map(([name]) => name);

  // Merge MealDB canonical ingredients at the top
  const ingredientSet = new Set<string>();
  for (const i of mealdb?.ingredients ?? []) ingredientSet.add(i);
  for (const i of usda) ingredientSet.add(i);
  for (const i of topIngredients) ingredientSet.add(i);

  // Tags -> meals / occasions / diets (intersected with our manual vocab)
  const tagTop = [...freq.entries()]
    .filter(([k]) => k.startsWith("tag:"))
    .map(([k]) => k.slice(4));
  const tagSet = new Set(tagTop);
  const dietsHit = MANUAL.diets.filter((d) => tagSet.has(d));
  const mealsHit = MANUAL.meals.filter((m) => tagSet.has(m));
  const occasionsHit = MANUAL.occasions.filter((o) => tagSet.has(o));

  const ontology = {
    version: 1,
    generatedAt: new Date().toISOString(),
    cuisines: Array.from(new Set([
      "indian", "italian", "mexican", "thai", "chinese", "japanese",
      "korean", "french", "mediterranean", "american", "greek", "vietnamese",
      "spanish", "middle-eastern", "turkish", "ethiopian", "moroccan",
      "peruvian", "brazilian", "british", "german", ...(mealdb?.cuisines ?? []),
    ])).sort(),
    regions: {
      indian: ["north", "south", "punjabi", "bengali", "gujarati", "maharashtrian",
               "andhra", "tamil", "kerala", "goan", "hyderabadi", "rajasthani",
               "kashmiri", "chettinad", "mangalorean", "udupi"],
      chinese: ["sichuan", "cantonese", "hunan", "shandong", "fujian", "zhejiang"],
      italian: ["tuscan", "sicilian", "neapolitan", "roman", "ligurian"],
      mexican: ["oaxacan", "yucatecan", "poblano", "norteño"],
    },
    ingredients: [...ingredientSet].sort(),
    techniques: Array.from(new Set([
      "grill", "roast", "bake", "fry", "stir-fry", "steam", "boil", "simmer",
      "saute", "braise", "broil", "smoke", "cure", "marinate", "ferment",
      "pickle", "caramelize", "deglaze", "whisk", "knead", "temper", "tadka",
      "bhuna", "dum", "tandoor", "slow-cook", "pressure-cook", "air-fry",
      "sous-vide", "blanch", "toast", "reduce",
      ...[...(nlg?.techniques?.keys() ?? [])].map(clean),
    ])).sort(),
    flavors: MANUAL.flavors,
    textures: MANUAL.textures,
    moods: MANUAL.moods,
    diets: Array.from(new Set([...MANUAL.diets, ...dietsHit])).sort(),
    meals: Array.from(new Set([...MANUAL.meals, ...mealsHit])).sort(),
    occasions: Array.from(new Set([...MANUAL.occasions, ...occasionsHit])).sort(),
    categories: mealdb?.categories ?? [],
  };

  writeFileSync(OUT, JSON.stringify(ontology, null, 2));
  console.log(`\n==> wrote ${OUT}`);
  console.log(`   ingredients: ${ontology.ingredients.length}`);
  console.log(`   cuisines:    ${ontology.cuisines.length}`);
  console.log(`   techniques:  ${ontology.techniques.length}`);
  console.log(`   flavors:     ${ontology.flavors.length}`);
  console.log(`   textures:    ${ontology.textures.length}`);
  console.log(`   moods:       ${ontology.moods.length}`);
  console.log(`   diets:       ${ontology.diets.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
