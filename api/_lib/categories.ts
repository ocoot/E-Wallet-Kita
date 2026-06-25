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
  description_id: string | null;
  description_en: string | null;
  priority: number;
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
    .order("priority", { ascending: false })
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
 * Now includes descriptions for better context as requested.
 */
export function generateCategoryPrompt(categories: Category[], typeFilter?: "income" | "expense"): string {
  const filtered = typeFilter 
    ? categories.filter(c => c.type === typeFilter || c.type === "both")
    : categories;

  return filtered
    .map(c => {
      const label = c.label_id || c.key;
      const desc = c.description_id || c.description_en || "";
      return `- Key: ${c.key}\n  Label: ${label}\n  Used for: ${desc}`;
    })
    .join("\n\n");
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
