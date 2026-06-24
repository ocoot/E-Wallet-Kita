import { supabase } from "./supabase";

export async function getPremiumBasePrice(): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "premium_base_price")
    .single();

  return Number(data?.value ?? 20000);
}
