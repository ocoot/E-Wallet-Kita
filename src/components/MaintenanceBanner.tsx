import React from "react";
import { AlertTriangle } from "lucide-react";
import { useMaintenance } from "../contexts/MaintenanceContext";
import { useThemeTokens } from "../hooks/useThemeTokens";

/**
 * Banner global berisi running text (marquee) yang muncul di semua halaman
 * ketika mode maintenance sedang aktif. Teks diambil dari MaintenanceContext,
 * yang sumbernya adalah tabel `maintenance_settings` di database — tidak ada
 * teks yang di-hardcode di komponen ini.
 */
export const MaintenanceBanner: React.FC = () => {
  const { tokens, cx } = useThemeTokens();
  const { status, runningText } = useMaintenance();

  if (!status.is_active || !runningText) return null;

  // Teks ditampilkan satu kali saja. Dengan animasi entrance-from-right
  // (lihat index.css), setiap siklus loop dimulai & berakhir di luar layar,
  // jadi tidak perlu trik duplikasi teks untuk membuat loop menyambung.
  const trackContent = runningText;

  return (
    <div
      role="status"
      className={cx(
        "w-full border-b overflow-hidden flex items-center gap-2 px-3 py-2",
        "bg-amber-500/15 border-amber-500/40 text-amber-300 light_sakura:bg-amber-100 light_sakura:text-amber-700 light_sakura:border-amber-300"
      )}
    >
      <AlertTriangle size={14} className="shrink-0" />
      <div className="overflow-hidden flex-1">
        <div
          className="maintenance-marquee-track text-xs font-bold"
          style={{ animationDuration: "18s" }}
        >
          <span>{trackContent}</span>
        </div>
      </div>
    </div>
  );
};
