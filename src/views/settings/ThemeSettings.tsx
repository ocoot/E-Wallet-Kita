import React from "react";
import { motion } from "motion/react";
import { SunMoon } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { audioFeedback } from "../../lib/audio";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";

/** Halaman detail "Tema Tampilan" (mobile). */
export const ThemeSettings: React.FC = () => {
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { tokens, cx } = useThemeTokens();

  return (
    <MobileSettingsDetailPage title={t("settings.menu_theme")}>
      <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-800/60 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-4">
        <h3 className={cx("font-sans font-bold text-sm border-b border-slate-800/10 pb-2.5 light_sakura:border-rose-100 flex items-center gap-2", tokens.text.label)}>
          <SunMoon size={14} className={cx(tokens.icon.accent)} />
          <span>{t("settings.theme")}</span>
        </h3>

        <div className="grid grid-cols-1 gap-2">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { audioFeedback.playChime(); setTheme("dark_obsidian"); }}
            className={`py-3.5 rounded-xl font-sans text-sm font-bold border transition-all cursor-pointer text-left px-4
              ${theme === "dark_obsidian"
                ? "bg-indigo-600/10 border-indigo-500 text-indigo-400"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
              }`}
          >
            {t("settings.theme_dark_obsidian")}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { audioFeedback.playChime(); setTheme("light_sakura"); }}
            className={`py-3.5 rounded-xl font-sans text-sm font-bold border transition-all cursor-pointer text-left px-4
              ${theme === "light_sakura"
                ? "bg-rose-500/10 border-rose-500 text-rose-600"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
              }`}
          >
            {t("settings.theme_light_sakura")}
          </motion.button>
        </div>
      </div>
    </MobileSettingsDetailPage>
  );
};
