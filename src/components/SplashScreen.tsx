import React from "react";
import { motion, useReducedMotion } from "motion/react";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { useLanguage } from "../contexts/LanguageContext";
import { useThemeTokens } from "../hooks/useThemeTokens";

/**
 * Splash screen full-screen yang tampil selagi `AuthProvider` masih resolve
 * sesi user (lihat pemakaian di App.tsx -> MainLayout, menggantikan teks
 * "Loading..." polos yang sebelumnya ada di situ).
 *
 * Desain: varian "Clean Light — Minimal Ring" (lihat splash-mockups.html
 * yang sebelumnya dibuat untuk perbandingan 3 konsep). Sengaja dibuat
 * senada dengan overlay loading logout yang sudah ada di App.tsx (cincin
 * spinner indigo di sekeliling logo), supaya kesan "loading" konsisten di
 * seluruh app -- bedanya splash ini full-bleed (bukan kartu terpusat)
 * karena tampil sebagai layar pertama sebelum ada apa pun untuk dipusatkan.
 *
 * Menghormati prefers-reduced-motion: kalau user mengaktifkan setting itu
 * di OS-nya, spin ring & pulse logo otomatis dihentikan (cuma fade-in polos).
 */
export const SplashScreen: React.FC = () => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[100] flex items-center justify-center
                 bg-[#faf9fb] light_sakura:bg-[#fff5f6]"
    >
      <div className="flex flex-col items-center gap-5">
        {/* Logo + spinning ring */}
        <div className="relative w-[104px] h-[104px] flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border-2
                       border-indigo-100 light_sakura:border-rose-100"
          />
          {!shouldReduceMotion && (
            <div
              className="absolute inset-0 rounded-full border-2 border-transparent
                         border-t-indigo-600 border-r-violet-500 animate-spin
                         light_sakura:border-t-rose-50 light_sakura:border-r-rose-300"
              style={{ animationDuration: "1.4s" }}
            />
          )}
          <img
            src={logoUrl}
            alt="E-Wallet Kita"
            className="relative z-10 w-[58px] h-auto object-contain"
          />
        </div>

        {/* Brand */}
        <div className="flex flex-col items-center gap-1.5">
          <p className="font-sans font-extrabold text-base tracking-tight text-slate-900 light_sakura:text-slate-800">
            E-Wallet <span className="text-indigo-600 light_sakura:text-rose-500">Kita</span>
          </p>
          <p className="font-mono text-[10.5px] tracking-wider uppercase text-slate-400 light_sakura:text-rose-400">
            {t("auth.loading_app_desc")}
          </p>
        </div>
      </div>
    </motion.div>
  );
};
