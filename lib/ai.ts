import type { Recipe } from "./types";

type Provider = {
  name: string;
  enabled: boolean;
  call: (prompt: string) => Promise<string>;
};

const SYSTEM_PROMPT = `You are a precise recipe generator for foodrecipes.page.
Return ONLY valid JSON matching this exact shape — no markdown, no commentary:
{
  "title": string,
  "description": string (1-2 sentences),
  "cuisine": string | null,
  "diet": string[] | null,
  "meal": "breakfast"|"lunch"|"dinner"|"snack"|"dessert"|null,
  "ingredients": [{"name": string, "amount": string, "notes": string?}],
  "instructions": string[] (numbered steps as separate entries),
  "prepTimeMin": number,
  "cookTimeMin": number,
  "totalTimeMin": number,
  "servings": number,
  "difficulty": "easy"|"medium"|"hard",
  "tags": string[],
  "nutrition": {"calories": number, "protein": number, "carbs": number, "fat": number}
}
Rules:
- Realistic quantities and times
- Safe cooking temperatures for meats
- 4-10 ingredients typical
- 4-12 instruction steps typical
- Tags should be lowercase, kebab-case`;

function buildUserPrompt(input: {
  ingredients: string[];
  cuisine?: string | null;
  diet?: string | null;
  meal?: string | null;
  dish?: string | null;
}): string {
  const parts: string[] = [];
  if (input.ingredients.length) parts.push(`Ingredients available: ${input.ingredients.join(", ")}`);
  if (input.cuisine) parts.push(`Cuisine: ${input.cuisine}`);
  if (input.diet) parts.push(`Diet: ${input.diet}`);
  if (input.meal) parts.push(`Meal: ${input.meal}`);
  if (input.dish) parts.push(`Dish type: ${input.dish}`);
  parts.push("Generate a recipe in JSON only.");
  return parts.join("\n");
}

async function callOpenAICompat(opts: {
  url: string;
  key: string;
  model: string;
  prompt: string;
}): Promise<string> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.key}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: opts.prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${opts.url} ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(key: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function providers(): Provider[] {
  return [
    {
      name: "groq",
      enabled: !!process.env.GROQ_API_KEY,
      call: (p) =>
        callOpenAICompat({
          url: "https://api.groq.com/openai/v1/chat/completions",
          key: process.env.GROQ_API_KEY!,
          model: "llama-3.3-70b-versatile",
          prompt: p,
        }),
    },
    {
      name: "gemini",
      enabled: !!process.env.GEMINI_API_KEY,
      call: (p) => callGemini(process.env.GEMINI_API_KEY!, p),
    },
    {
      name: "cerebras",
      enabled: !!process.env.CEREBRAS_API_KEY,
      call: (p) =>
        callOpenAICompat({
          url: "https://api.cerebras.ai/v1/chat/completions",
          key: process.env.CEREBRAS_API_KEY!,
          model: "llama-3.3-70b",
          prompt: p,
        }),
    },
    {
      name: "openrouter",
      enabled: !!process.env.OPENROUTER_API_KEY,
      call: (p) =>
        callOpenAICompat({
          url: "https://openrouter.ai/api/v1/chat/completions",
          key: process.env.OPENROUTER_API_KEY!,
          model: "meta-llama/llama-3.3-70b-instruct:free",
          prompt: p,
        }),
    },
  ];
}

function validate(raw: string): Partial<Recipe> | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj.title || !Array.isArray(obj.ingredients) || !Array.isArray(obj.instructions)) {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

export async function generateRecipe(input: {
  ingredients: string[];
  cuisine?: string | null;
  diet?: string | null;
  meal?: string | null;
  dish?: string | null;
}): Promise<{ recipe: Partial<Recipe>; providerUsed: string } | null> {
  const prompt = buildUserPrompt(input);
  const list = providers().filter((p) => p.enabled);
  if (list.length === 0) {
    throw new Error("No AI providers configured. Set at least one API key.");
  }
  for (const p of list) {
    try {
      const raw = await p.call(prompt);
      const parsed = validate(raw);
      if (parsed) return { recipe: parsed, providerUsed: p.name };
    } catch (err) {
      console.warn(`[ai] ${p.name} failed:`, (err as Error).message);
    }
  }
  return null;
}
