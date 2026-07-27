import React from "react";
import { ShieldCheck } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";

/** Halaman detail "Kebijakan Privasi" (mobile). Konten statis. */
export const PrivacyPolicySettings: React.FC = () => {
  const { t } = useLanguage();
  const { tokens, cx } = useThemeTokens();

  const sections = [1, 2, 3, 4, 5].map((n) => ({
    title: t(`settings.privacy_policy_body_${n}_title`),
    text: t(`settings.privacy_policy_body_${n}_text`),
  }));

  return (
    <MobileSettingsDetailPage title={t("settings.menu_privacy_policy")} description={t("settings.privacy_policy_page_desc")}>
      <div className={cx("p-5 rounded-2xl shadow-sm space-y-4", tokens.settings.profileCardBgBorder)}>
        <h3 className={cx("font-sans font-bold text-sm flex items-center gap-2", tokens.text.label)}>
          <ShieldCheck size={14} className={tokens.icon.accent} />
          <span>{t("settings.menu_privacy_policy")}</span>
        </h3>
        <div className="space-y-4">
          {sections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              <p className={cx("font-sans text-xs font-bold", tokens.text.label)}>{section.title}</p>
              <p className={cx("font-sans text-xs leading-relaxed", tokens.text.mutedAlt)}>{section.text}</p>
            </div>
          ))}
        </div>
      </div>
    </MobileSettingsDetailPage>
  );
};
