import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle, Smartphone } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useToast } from "../../contexts/ToastContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { audioFeedback } from "../../lib/audio";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";

/** Halaman detail "Instalasi Aplikasi" / PWA (mobile). */
export const PwaSettings: React.FC = () => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { tokens, cx } = useThemeTokens();

  const [canInstall, setCanInstall] = useState(!!window.deferredPrompt);
  const [isStandalone, setIsStandalone] = useState(
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );

  useEffect(() => {
    const handleInstallable = () => setCanInstall(true);
    const handleInstalled = () => {
      setCanInstall(false);
      setIsStandalone(true);
    };

    window.addEventListener("pwa-installable", handleInstallable);
    window.addEventListener("pwa-installed", handleInstalled);

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleMediaChange = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
    try {
      mediaQuery.addEventListener("change", handleMediaChange);
    } catch (e) {
      try { mediaQuery.addListener(handleMediaChange); } catch (err) {}
    }

    return () => {
      window.removeEventListener("pwa-installable", handleInstallable);
      window.removeEventListener("pwa-installed", handleInstalled);
      try {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } catch (e) {
        try { mediaQuery.removeListener(handleMediaChange); } catch (err) {}
      }
    };
  }, []);

  const handleInstallClick = async () => {
    audioFeedback.playClick();
    const promptEvent = window.deferredPrompt;
    if (!promptEvent) {
      showToast(t("settings.pwa_not_supported"), "info");
      return;
    }
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") {
      window.deferredPrompt = null;
      setCanInstall(false);
      showToast(t("toast.success_pwa"), "success");
    }
  };

  return (
    <MobileSettingsDetailPage title={t("settings.menu_pwa")} description={t("settings.pwa_desc")}>
      <div className={cx("p-5 rounded-2xl shadow-sm space-y-4", tokens.settings.profileCardBgBorder)}>
        <h3 className={cx("font-sans font-bold text-sm flex items-center gap-2", tokens.text.label, tokens.settings.sectionDivider)}>
          <Smartphone size={14} className={cx(tokens.icon.accent)} />
          <span>{t("settings.pwa_section")}</span>
        </h3>

        {isStandalone ? (
          <div className={cx("flex items-center gap-2 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20", tokens.text.success)}>
            <CheckCircle size={16} />
            <span className="font-sans text-xs font-semibold">{t("settings.pwa_installed")}</span>
          </div>
        ) : canInstall ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={handleInstallClick}
            className="w-full cursor-pointer py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-sans text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all"
          >
            <Smartphone size={14} />
            <span>{t("settings.pwa_btn_install")}</span>
          </motion.button>
        ) : (
          <div className={cx("p-3 rounded-xl text-xs leading-relaxed", tokens.settings.innerCardBgBorder, tokens.text.mutedAlt)}>
            <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)]">{t("settings.pwa_not_supported")}</p>
          </div>
        )}
      </div>
    </MobileSettingsDetailPage>
  );
};
