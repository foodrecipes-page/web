import type { Metadata } from "next";
import { cache } from "react";
import { fetchFromCache } from "@/lib/shards";
import { getHotRecipe, enqueueRecipe } from "@/lib/redis";
import { parseSlug } from "@/lib/slug";
import { generateRecipe } from "@/lib/ai";
import type { Recipe } from "@/lib/types";
import { RecipeView } from "@/components/RecipeView";
import { ClientRecipeFallback } from "@/components/ClientRecipeFallback";

type PageProps = { params: Promise<{ slug: string }> };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://foodrecipes.page";

const loadRecipe = cache(async (slug: string): Promise<Recipe | null> => {
  // 1. Public CDN cache (GitHub shard repos via jsDelivr)
  const cached = await fetchFromCache(slug);
  if (cached) return cached;

  // 2. Hot Redis cache (just-generated, not yet committed)
  const hot = await getHotRecipe(slug);
  if (hot) return hot as Recipe;

  // 3. AI fallback — parse slug and generate a fresh recipe.
  //    Only if at least one provider key is configured.
  const parsed = parseSlug(slug);
  if (parsed.ingredients.length === 0) return null;

  const anyProvider =
    !!process.env.GROQ_API_KEY ||
    !!process.env.GEMINI_API_KEY ||
    !!process.env.CEREBRAS_API_KEY ||
    !!process.env.OPENROUTER_API_KEY;
  if (!anyProvider) return null;

  try {
    const result = await generateRecipe({
      ingredients: parsed.ingredients,
      cuisine: parsed.cuisine,
      diet: parsed.diet,
    });
    if (!result) return null;

    const recipe: Recipe = {
      slug,
      title: result.recipe.title || "Recipe",
      description: result.recipe.description || "",
      cuisine: result.recipe.cuisine ?? parsed.cuisine,
      diet: result.recipe.diet ?? (parsed.diet ? [parsed.diet] : null),
      meal: result.recipe.meal ?? null,
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

    // Fire-and-forget enqueue so next visitor hits cache instantly.
    enqueueRecipe(slug, recipe).catch(() => {});

    return recipe;
  } catch (err) {
    console.warn("[recipe-page] AI fallback failed:", (err as Error).message);
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await loadRecipe(slug);
  if (!recipe) return { title: "Recipe not found" };
  return {
    title: recipe.title,
    description: recipe.description,
    alternates: { canonical: recipe.canonicalUrl },
    openGraph: {
      title: recipe.title,
      description: recipe.description,
      url: recipe.canonicalUrl,
      type: "article",
    },
  };
}

export default async function RecipePage({ params }: PageProps) {
  const { slug } = await params;
  const recipe = await loadRecipe(slug);
  if (!recipe) {
    // Server cache miss — let the client try sessionStorage (fresh generation).
    return <ClientRecipeFallback slug={slug} />;
  }

  // schema.org Recipe JSON-LD for rich SEO results
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.description,
    recipeCuisine: recipe.cuisine,
    recipeCategory: recipe.meal,
    prepTime: `PT${recipe.prepTimeMin}M`,
    cookTime: `PT${recipe.cookTimeMin}M`,
    totalTime: `PT${recipe.totalTimeMin}M`,
    recipeYield: `${recipe.servings} servings`,
    recipeIngredient: recipe.ingredients.map((i) => `${i.amount} ${i.name}`.trim()),
    recipeInstructions: recipe.instructions.map((text, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text,
    })),
    keywords: recipe.tags.join(", "),
    nutrition: recipe.nutrition && {
      "@type": "NutritionInformation",
      calories: recipe.nutrition.calories ? `${recipe.nutrition.calories} cal` : undefined,
      proteinContent: recipe.nutrition.protein ? `${recipe.nutrition.protein} g` : undefined,
      carbohydrateContent: recipe.nutrition.carbs ? `${recipe.nutrition.carbs} g` : undefined,
      fatContent: recipe.nutrition.fat ? `${recipe.nutrition.fat} g` : undefined,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <RecipeView recipe={recipe} />
    </>
  );
}
