import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useInstallments } from "../hooks/useInstallments";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";

/**
 * Baris "Cicilan" di dalam grouped list Pantauan Keuangan (lihat
 * Dashboard.tsx) -- versi RINGKAS satu baris ala iOS Settings/Wallet: ikon
 * bulat + judul + SATU baris subjudul (nama cicilan teratas · progresnya,
 * mis. "Cicilan Motor · 1/12 bulan") + chevron. Daftar lengkap semua
 * cicilan aktif (bukan cuma satu) sengaja TIDAK ditampilkan di sini lagi --
 * itu tugas halaman /installments yang dituju kalau baris ini di-tap.
 */
export const DashboardInstallments: React.FC = () => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { installments, loading } = useInstallments(user?.id);

  // `installments` sudah terurut (belum lunas dulu, progres terbesar di
  // atas -- lihat useInstallments.ts), jadi active[0] otomatis yang paling
  // relevan untuk ditampilkan sebagai satu baris ringkasan.
  const active = installments.filter((i) => !i.is_completed);

  if (loading || active.length === 0) return null;

  const top = active[0];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <button
        type="button"
        onClick={() => { audioFeedback.playClick(); navigate("/installments"); }}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer transition-colors hover:bg-white/[0.02] light_sakura:hover:bg-slate-900/[0.02]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className={cx("font-sans font-bold text-sm truncate", tokens.text.heading)}>
              {t("installments.dashboard_row_title")}
            </h3>
            <p className={cx("text-xs truncate", tokens.text.muted)}>
              {t("installments.dashboard_row_subtitle", { name: top.name, paid: top.months_paid, total: top.total_months })}
            </p>
          </div>
        </div>
        <ChevronRight size={18} className={cx("shrink-0", tokens.text.muted)} />
      </button>
    </motion.div>
  );
};
