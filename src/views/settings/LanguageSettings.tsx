import React from "react";
import { motion } from "motion/react";
import { Globe } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { audioFeedback } from "../../lib/audio";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";

/** Halaman detail "Bahasa" (mobile). */
export const LanguageSettings: React.FC = () => {
  const { locale, setLocale, t } = useLanguage();
  const { tokens, cx } = useThemeTokens();

  return (
    <MobileSettingsDetailPage title={t("settings.menu_language")}>
      <div className="p-5 rounded-2xl border bg-slate-950/40 border-slate-800/60 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 shadow-sm space-y-4">
        <h3 className={cx("font-sans font-bold text-sm border-b border-slate-800/10 pb-2.5 light_sakura:border-rose-100 flex items-center gap-2", tokens.text.label)}>
          <Globe size={14} className={cx(tokens.icon.accent)} />
          <span>{t("settings.language")}</span>
        </h3>

        <div className="grid grid-cols-1 gap-2">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { audioFeedback.playClick(); setLocale("id"); }}
            className={`py-3.5 rounded-xl font-sans text-sm font-bold border transition-all cursor-pointer text-left px-4
              ${locale === "id"
                ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:border-rose-550 light_sakura:text-rose-600"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
              }`}
          >
            Bahasa Indonesia (ID)
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { audioFeedback.playClick(); setLocale("en"); }}
            className={`py-3.5 rounded-xl font-sans text-sm font-bold border transition-all cursor-pointer text-left px-4
              ${locale === "en"
                ? "bg-indigo-600/10 border-indigo-500 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:border-rose-550 light_sakura:text-rose-600"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500"
              }`}
          >
            English (EN)
          </motion.button>
        </div>
      </div>
    </MobileSettingsDetailPage>
  );
};
