import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
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

  // Sync with Supabase on mount/user change.
  // PENTING: dependency-nya `user?.id` (string), BUKAN `user` (object).
  // `user` dari AuthContext mendapat reference BARU setiap event auth apa pun
  // (termasuk TOKEN_REFRESHED yang terjadi otomatis tiap sesi berjalan cukup
  // lama, di production sekalipun) walau id-nya sama persis. Kalau dependency-
  // nya `user` (object), efek ini akan re-fetch preferred_language ke DB
  // setiap kali itu terjadi, padahal tidak ada yang berubah.
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
  }, [user?.id]);

  const setLocale = useCallback(async (newLocale: Locale) => {
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
  }, [user]);

  // Sinkronkan <html lang="..."> dan href PWA manifest dengan bahasa yang
  // sedang aktif dipakai (bukan cuma teks UI lewat `t()`).
  //
  // Root cause / why: sebelumnya index.html hardcode `<html lang="en">`
  // sementara SEMUA konten default app (termasuk manifest.json yang
  // di-generate vite-plugin-pwa) berbahasa Indonesia -- attribute lang jadi
  // salah bahkan untuk user default sekalipun, bukan cuma saat ganti ke
  // Inggris. `<html lang>` dipakai screen reader untuk memilih
  // pengucapan/pelafalan yang benar, jadi ketidakcocokan ini nyata
  // berdampak ke aksesibilitas, bukan cuma kosmetik.
  //
  // manifest.json sendiri adalah file statis (di-generate sekali saat
  // build oleh vite-plugin-pwa, lihat vite.config.ts) sehingga TIDAK bisa
  // berisi 2 bahasa sekaligus atau ikut re-render seperti komponen React.
  // Solusinya: siapkan varian terjemahan Inggris sebagai file statis
  // terpisah (public/manifest-en.json, isi sama persis strukturnya --
  // name/shortcuts/screenshots -- cuma teksnya diterjemahkan & lang:'en'),
  // lalu tukar href <link rel="manifest"> di sini setiap locale berubah.
  // Browser membaca manifest saat prompt "Tambah ke Layar Utama" muncul,
  // jadi swap ini efektif selama dilakukan SEBELUM user menekan install --
  // bukan solusi sempurna untuk kasus user ganti bahasa SETELAH app
  // ter-install (manifest PWA yang sudah terpasang tidak otomatis
  // refresh), tapi menutup celah utama: user yang memang berbahasa
  // Inggris sejak awal (baik dari preferensi tersimpan atau device locale)
  // akan melihat listing/label PWA berbahasa Inggris, bukan Indonesia yang
  // di-hardcode.
  useEffect(() => {
    document.documentElement.lang = locale;

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.setAttribute('href', locale === 'en' ? '/manifest-en.json' : '/manifest.json');
    }
  }, [locale]);

  /**
   * Safe translate function with nested key traversal and interpolation replacements.
   *
   * Di-`useCallback` dengan dependency `[locale]` saja, supaya reference `t`
   * TIDAK berubah kecuali locale benar-benar berganti. Sebelumnya `t` dibuat
   * ulang setiap render LanguageProvider (termasuk render yang dipicu oleh hal
   * yang tidak terkait bahasa sama sekali), yang membuat SEMUA komponen di
   * seluruh app yang punya `useCallback([...,  t])` ikut membuat fungsi baru
   * setiap saat -> memicu useEffect terkait fetch data re-fire terus-menerus
   * (inilah penyebab "fetch storm"/terasa seperti reload di Admin Panel).
   */
  const t = useCallback((key: string, replacements?: Record<string, string | number>): string => {
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
    if (replacements && typeof replacements === "object" && !Array.isArray(replacements)) {
      Object.entries(replacements).forEach(([k, v]) => {
        // Escape the key to prevent it from being interpreted as a regex quantifier
        // and also escape the curly braces themselves.
        const escapedKey = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        parsedString = parsedString.replace(new RegExp(`\\{${escapedKey}\\}`, "g"), String(v));
      });
    }

    return parsedString;
  }, [locale]);

  // Memo context value supaya object-nya juga stabil (tidak berubah reference)
  // selama locale/setLocale/t sendiri tidak berubah.
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider");
  return context;
};
