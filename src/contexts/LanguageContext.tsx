import React, { createContext, useContext, useState, useEffect } from "react";
import idTranslations from "../locales/id.json";
import enTranslations from "../locales/en.json";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";

type Locale = "id" | "en";

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Locale, any> = {
  id: idTranslations,
  en: enTranslations,
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  // Retrieve from localStorage or check browser preferences
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem("ewallet_language") as Locale;
    if (saved === "id" || saved === "en") return saved;
    return "id"; 
  });

  // Sync with Supabase on mount/user change
  useEffect(() => {
    const fetchPref = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('users')
        .select('preferred_language')
        .eq('id', user.id)
        .single();
      
      if (!error && data?.preferred_language) {
        const dbLocale = data.preferred_language as Locale;
        if (dbLocale === "id" || dbLocale === "en") {
          setLocaleState(dbLocale);
          localStorage.setItem("ewallet_language", dbLocale);
        }
      }
    };
    fetchPref();
  }, [user]);

  const setLocale = async (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("ewallet_language", newLocale);
    
    if (user) {
      try {
        await supabase
          .from('users')
          .update({ preferred_language: newLocale })
          .eq('id', user.id);
      } catch (err) {
        console.error("Error syncing language preference:", err);
      }
    }
  };

  /**
   * Safe translate function with nested key traversal and interpolation replacements
   */
  const t = (key: string, replacements?: Record<string, string | number>): string => {
    const activeDictionary = translations[locale];
    const keys = key.split(".");
    let value = activeDictionary;

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return key; // Return translation key itself as fallback
      }
    }

    if (typeof value !== "string") {
      return key;
    }

    let parsedString = value;
    if (replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        parsedString = parsedString.replace(new RegExp(`{${k}}`, "g"), String(v));
      });
    }

    return parsedString;
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider");
  return context;
};
