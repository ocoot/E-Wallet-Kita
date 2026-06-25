import { useState, useEffect } from "react";
import { dbService } from "../lib/db";
import { Category } from "../types";

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await dbService.getCategories();
        if (mounted) {
          setCategories(data);
          setLoading(false);
        }
      } catch (err) {
        console.error("useCategories error:", err);
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  return { categories, loading };
}
