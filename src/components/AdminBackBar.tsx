import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { audioFeedback } from "../lib/audio";

/**
 * Bar navigasi "Kembali" yang tampil di atas setiap halaman detail Admin
 * Panel (Manajemen User, Monitor Premium, Voucher, dst). Setiap menu di
 * daftar `/admin` sekarang membuka route halaman barunya sendiri (lihat
 * App.tsx & AdminPanel.tsx) alih-alih merender kontennya langsung di
 * halaman yang sama -- supaya tidak perlu scroll panjang melewati daftar
 * menu + konten sekaligus. Komponen ini menjaga jalan kembali ke daftar
 * menu tetap konsisten & jelas di semua halaman turunan tsb.
 */
export const AdminBackBar: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { tokens, cx } = useThemeTokens();

  const handleBack = () => {
    audioFeedback.playClick();
    navigate("/admin");
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className={cx(
        "flex items-center gap-2 px-4 py-2.5 rounded-xl border font-sans text-xs font-bold cursor-pointer transition-all duration-200 active:scale-[0.98]",
        tokens.adminBackBar.btnBg,
        tokens.text.secondary
      )}
    >
      <ChevronLeft size={16} />
      {t("admin.back_to_panel")}
    </button>
  );
};
