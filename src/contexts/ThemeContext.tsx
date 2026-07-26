import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";

type Theme = "dark_obsidian" | "light_sakura";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Warna status bar HP disamakan dengan warna AWAL gradient ribbon/hero
// (lihat RIBBON_GRADIENT_CSS/RIBBON_GRADIENT_CLASS di PageRibbonBackground.tsx,
// satu-satunya sumber gradient ribbon untuk seluruh app termasuk hero
// Dashboard) -- BUKAN lagi warna canvas polos -- supaya status bar menyatu
// dengan ribbon berwarna di bagian atas tiap halaman.
// WAJIB disamakan manual dengan stop pertama gradient di file itu kalau
// suatu saat palet ribbon berubah:
//   dark_obsidian: var(--color-indigo-500) -> #3FBE9B
//   light_sakura:  var(--color-rose-400)   -> #4CA98A
const STATUS_BAR_COLOR: Record<Theme, string> = {
  dark_obsidian: "#3FBE9B",
  light_sakura: "#4CA98A",
};

function applyStatusBarColor(theme: Theme) {
  if (typeof document === "undefined") return;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", STATUS_BAR_COLOR[theme]);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("ewallet_theme") as Theme;
    if (saved === "dark_obsidian" || saved === "light_sakura") return saved;
    return "dark_obsidian"; 
  });

  // Sync with Supabase on mount/user change
  useEffect(() => {
    const fetchPref = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('users')
        .select('preferred_theme')
        .eq('id', user.id)
        .single();
      
      if (!error && data?.preferred_theme) {
        const dbTheme = data.preferred_theme as Theme;
        if (dbTheme === "dark_obsidian" || dbTheme === "light_sakura") {
          setThemeState(dbTheme);
          localStorage.setItem("ewallet_theme", dbTheme);
        }
      }
    };
    fetchPref();
  }, [user]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("ewallet_theme", newTheme);

    // Apply classes globally -- lewat View Transitions API kalau tersedia
    // (P4 4.8) supaya perubahan warna terasa crossfade halus (~250ms),
    // bukan "snap" instan. Browser yang belum dukung (mis. Firefox lama)
    // otomatis fallback ke perubahan instan seperti sebelumnya.
    const applyThemeClasses = () => {
      const root = window.document.documentElement;
      root.classList.remove("dark_obsidian", "light_sakura");
      root.classList.add(newTheme);
      applyStatusBarColor(newTheme);
    };
    if (typeof document !== "undefined" && typeof document.startViewTransition === "function") {
      document.startViewTransition(applyThemeClasses);
    } else {
      applyThemeClasses();
    }

    if (user) {
      try {
        await supabase
          .from('users')
          .update({ preferred_theme: newTheme })
          .eq('id', user.id);
      } catch (err) {
        console.error("Error syncing theme preference:", err);
      }
    }
  };

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("dark_obsidian", "light_sakura");
    root.classList.add(theme);
    applyStatusBarColor(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
