import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Download, ShieldQuestion, Trash2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useToast } from "../../contexts/ToastContext";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { audioFeedback } from "../../lib/audio";
import { exportMyData, deleteMyAccount } from "../../lib/privacy";
import { DeleteAccountModal } from "../../components/DeleteAccountModal";
import { MobileSettingsDetailPage } from "../../components/settings/MobileSettingsDetailPage";
import { reportFrontendError } from "../../lib/errorReporter";

/** Halaman detail "Privasi & Data" (mobile) -- unduh data & hapus akun. */
export const PrivacySettings: React.FC = () => {
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { tokens, cx } = useThemeTokens();
  const navigate = useNavigate();

  const [isExportingData, setIsExportingData] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);

  const handleExportMyData = async () => {
    audioFeedback.playClick();
    setIsExportingData(true);
    try {
      await exportMyData();
      showToast(t("settings.privacy_export_success"), "success");
    } catch (err: any) {
      showToast(t("settings.privacy_export_error"), "error");
      void reportFrontendError({
        source: "frontend:settings-privacy",
        message: err?.message || String(err),
        context: { action: "export-my-data" },
      });
    } finally {
      setIsExportingData(false);
    }
  };

  const handleDeleteAccountConfirmed = async () => {
    await deleteMyAccount();
    audioFeedback.playChime();
    showToast(t("settings.privacy_delete_success"), "success");
    setIsDeleteAccountModalOpen(false);
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <MobileSettingsDetailPage title={t("settings.menu_privacy")} description={t("settings.privacy_section_desc")}>
      <div className={cx("p-5 rounded-2xl shadow-sm space-y-4", tokens.settings.profileCardBgBorder)}>
        <h3 className={cx("font-sans font-bold text-sm flex items-center gap-2", tokens.settings.sectionDivider, tokens.text.label)}>
          <ShieldQuestion size={14} className={cx(tokens.icon.accent)} />
          <span>{t("settings.privacy_section")}</span>
        </h3>

        <div className={cx("p-3.5 rounded-xl space-y-2.5", tokens.settings.innerCardBgBorder)}>
          <div className="flex items-start gap-2.5">
            <Download size={14} className={cx("mt-0.5 shrink-0", tokens.icon.accent)} />
            <div>
              <p className={cx("font-sans text-xs font-semibold", tokens.text.strong)}>
                {t("settings.privacy_export_title")}
              </p>
              <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 leading-relaxed mt-0.5">
                {t("settings.privacy_export_desc")}
              </p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="button"
            onClick={handleExportMyData}
            disabled={isExportingData}
            className={cx(tokens.privacySettings.exportBtn, tokens.surface.card)}
          >
            <Download size={13} />
            <span>{isExportingData ? t("common.loading") : t("settings.privacy_export_button")}</span>
          </motion.button>
        </div>

        <div className="p-3.5 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <Trash2 size={14} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className={cx("font-sans text-xs font-semibold", tokens.text.dangerSoft)}>
                {t("settings.privacy_delete_title")}
              </p>
              <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 leading-relaxed mt-0.5">
                {t("settings.privacy_delete_section_desc")}
              </p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="button"
            onClick={() => { audioFeedback.playClick(); setIsDeleteAccountModalOpen(true); }}
            className="w-full cursor-pointer border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 py-2.5 rounded-xl font-sans text-xs font-semibold text-red-400 tracking-tight transition-all flex items-center justify-center gap-2"
          >
            <Trash2 size={13} />
            <span>{t("settings.privacy_delete_button")}</span>
          </motion.button>
        </div>
      </div>

      <DeleteAccountModal
        isOpen={isDeleteAccountModalOpen}
        onCancel={() => setIsDeleteAccountModalOpen(false)}
        onConfirm={handleDeleteAccountConfirmed}
      />
    </MobileSettingsDetailPage>
  );
};
