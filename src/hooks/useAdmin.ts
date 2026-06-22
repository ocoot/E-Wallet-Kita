import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshAdmin = useCallback(async () => {
    if (!user) {
      setIsAdmin(false);
      setIsOwner(false);
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      setIsAdmin(data?.role === "admin" || data?.role === "owner");
      setIsOwner(data?.role === "owner");
    } catch (err) {
      console.error("Gagal memuat status admin:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshAdmin();
  }, [refreshAdmin]);

  return {
    isAdmin,
    isOwner,
    loading,
    refreshAdmin,
  };
}
