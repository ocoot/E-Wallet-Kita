import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface Category {
  id: string;
  key: string;
  type: "income" | "expense" | "both";
  label_id: string | null;
  label_en: string | null;
  is_active: boolean;
}

/**
 * Fetch all active categories from Supabase.
 * Includes basic caching (optional, but requested by user).
 */
let categoryCache: { data: Category[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getActiveCategories(): Promise<Category[]> {
  const now = Date.now();
  if (categoryCache && now - categoryCache.timestamp < CACHE_TTL) {
    return categoryCache.data;
  }

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("key");

  if (error) {
    console.error("Error fetching categories for AI:", error);
    return [];
  }

  categoryCache = { data: data as Category[], timestamp: now };
  return data as Category[];
}

/**
 * Generate a dynamic prompt string for AI model instructions.
 */
export function generateCategoryPrompt(categories: Category[], typeFilter?: "income" | "expense"): string {
  const filtered = typeFilter 
    ? categories.filter(c => c.type === typeFilter || c.type === "both")
    : categories;

  return filtered
    .map(c => `- ${c.key}: ${c.label_id || c.key} (${c.label_en || c.key})`)
    .join("\n");
}

/**
 * Validates if a key exists, otherwise returns a fallback.
 */
export function validateCategoryKey(key: string, categories: Category[], fallback = "other"): string {
  const exists = categories.some(c => c.key === key);
  if (exists) return key;
  
  const hasOther = categories.some(c => c.key === "other");
  return hasOther ? "other" : (categories[0]?.key || fallback);
}
