import React, { createContext, useContext, useState, useEffect } from "react";
import idTranslations from "../locales/id.json";
import enTranslations from "../locales/en.json";

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
  // Retrieve from localStorage or check browser preferences
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem("ewallet_language") as Locale;
    if (saved === "id" || saved === "en") return saved;
    return "id"; // Default is ID/Indonesian as per Target Persona Ibu Rumah Tangga
  });

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("ewallet_language", newLocale);
    
    // Update live profile preferences in simulated user DB
    const activeUser = localStorage.getItem("ewallet_active_user");
    if (activeUser) {
      try {
        const parsed = JSON.parse(activeUser);
        parsed.preferred_language = newLocale;
        localStorage.setItem("ewallet_active_user", JSON.stringify(parsed));
        
        // Also update in all users list cache
        const allUsers = JSON.parse(localStorage.getItem("ewallet_users") || "[]");
        const idx = allUsers.findIndex((u: any) => u.id === parsed.id);
        if (idx !== -1) {
          allUsers[idx].preferred_language = newLocale;
          localStorage.setItem("ewallet_users", JSON.stringify(allUsers));
        }
      } catch (err) {
        console.error("Error updates language preferences cache:", err);
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
