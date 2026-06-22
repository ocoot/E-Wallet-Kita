import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

export function usePremium() {
  const { user } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setIsPremium(false);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("users").select("is_premium").eq("id", user.id).single();
    setIsPremium(!!data?.is_premium);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { isPremium, loading, refresh };
}
