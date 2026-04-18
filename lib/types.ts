export type Recipe = {
  slug: string;
  title: string;
  description: string;
  cuisine: string | null;
  diet: string[] | null;
  meal: string | null;
  ingredients: { name: string; amount: string; notes?: string }[];
  instructions: string[];
  prepTimeMin: number;
  cookTimeMin: number;
  totalTimeMin: number;
  servings: number;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  source: string;
  canonicalUrl: string;
  providerUsed?: string;
  createdAt: string;
};

export type RecipeIndexEntry = {
  slug: string;
  title: string;
  tags: string[];
  cuisine: string | null;
  totalTimeMin: number;
  shard: string;
};
