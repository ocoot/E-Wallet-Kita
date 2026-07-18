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
      <div className={cx("p-5 rounded-2xl shadow-sm space-y-4", tokens.settings.profileCardBgBorder)}>
        <h3 className={cx("font-sans font-bold text-sm flex items-center gap-2", tokens.text.label, tokens.settings.sectionDivider)}>
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
                ? tokens.settings.telegramLinkedBadge
                : tokens.settings.optionInactive
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
                ? tokens.settings.telegramLinkedBadge
                : tokens.settings.optionInactive
              }`}
          >
            English (EN)
          </motion.button>
        </div>
      </div>
    </MobileSettingsDetailPage>
  );
};
