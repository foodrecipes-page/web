import { NextResponse } from "next/server";
import { buildCacheKey } from "@/lib/parser";
import { fetchWithLadder } from "@/lib/shards";
import { generateRecipe } from "@/lib/ai";
import { enqueueRecipe, rateLimiter } from "@/lib/redis";
import type { Recipe } from "@/lib/types";

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://foodrecipes.page";

function getIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "anonymous"
  );
}

export async function POST(req: Request) {
  let body: {
    ingredients?: string[];
    cuisine?: string | null;
    diet?: string | null;
    meal?: string | null;
    dish?: string | null;
    raw?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ingredients = (body.ingredients || []).map((i) => String(i).toLowerCase().trim()).filter(Boolean);
  if (ingredients.length === 0 && !body.dish) {
    return NextResponse.json({ error: "No ingredients or dish provided" }, { status: 400 });
  }

  const key = buildCacheKey(ingredients);

  // 1) Try cache ladder (no AI call)
  const cached = await fetchWithLadder(key, { cuisine: body.cuisine, diet: body.diet });
  if (cached) {
    return NextResponse.json({ slug: cached.recipe.slug, source: "cache", keyUsed: cached.keyUsed });
  }

  // 2) Rate limit before AI call
  const rl = rateLimiter();
  if (rl) {
    const ip = getIp(req);
    const { success, reset } = await rl.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Rate limit reached. Try again in a bit.", resetAt: reset },
        { status: 429 }
      );
    }
  }

  // 3) AI generation with fallback chain
  const result = await generateRecipe({
    ingredients,
    cuisine: body.cuisine,
    diet: body.diet,
    meal: body.meal,
    dish: body.dish,
  });

  if (!result) {
    return NextResponse.json(
      { error: "All AI providers unavailable. Please try again later." },
      { status: 503 }
    );
  }

  const slug = buildCacheKey(ingredients, { cuisine: body.cuisine, diet: body.diet });
  const recipe: Recipe = {
    slug,
    title: result.recipe.title || "Recipe",
    description: result.recipe.description || "",
    cuisine: result.recipe.cuisine ?? body.cuisine ?? null,
    diet: result.recipe.diet ?? (body.diet ? [body.diet] : null),
    meal: result.recipe.meal ?? body.meal ?? null,
    ingredients: result.recipe.ingredients || [],
    instructions: result.recipe.instructions || [],
    prepTimeMin: result.recipe.prepTimeMin ?? 10,
    cookTimeMin: result.recipe.cookTimeMin ?? 20,
    totalTimeMin: result.recipe.totalTimeMin ?? 30,
    servings: result.recipe.servings ?? 2,
    difficulty: result.recipe.difficulty ?? "easy",
    tags: result.recipe.tags || [],
    nutrition: result.recipe.nutrition,
    source: "foodrecipes.page",
    canonicalUrl: `${SITE_URL}/recipe/${slug}`,
    providerUsed: result.providerUsed,
    createdAt: new Date().toISOString(),
  };

  // 4) Enqueue for batch-commit to GitHub shard (non-blocking best-effort)
  try {
    await enqueueRecipe(slug, recipe);
  } catch (err) {
    console.warn("[queue] failed to enqueue:", (err as Error).message);
  }

  // 5) Return slug; recipe page will fetch it (from queue-proxied memory or cache)
  return NextResponse.json({
    slug,
    source: "generated",
    providerUsed: result.providerUsed,
    recipe,
  });
}
