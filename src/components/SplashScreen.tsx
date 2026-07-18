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
      className={cx(
        "fixed inset-0 z-[100] flex items-center justify-center",
        tokens.surface.canvas
      )}
    >
      <div className="flex flex-col items-center gap-5">
        {/* Logo + spinning ring */}
        <div className="relative w-[104px] h-[104px] flex items-center justify-center">
          <div
            className={cx(
              "absolute inset-0 rounded-full border-2",
              tokens.border.accent
            )}
          />
          {!shouldReduceMotion && (
            <div
              className={cx(
                "absolute inset-0 rounded-full border-2 border-transparent animate-spin",
                tokens.text.accent.replace(/text-/g, "border-t-"),
                tokens.text.accent.replace(/text-/g, "border-r-").replace(/indigo-400/g, "indigo-400/30").replace(/rose-500/g, "rose-500/30")
              )}
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
          <p className={cx("font-sans font-extrabold text-base tracking-tight", tokens.text.primary)}>
            E-Wallet <span className={cx(tokens.text.accent)}>Kita</span>
          </p>
          <p className={cx("font-mono text-[10.5px] tracking-wider uppercase", tokens.text.muted)}>
            {t("auth.loading_app_desc")}
          </p>
        </div>
      </div>
    </motion.div>
  );
};
