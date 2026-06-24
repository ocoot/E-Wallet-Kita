import React from "react";
import { AlertTriangle } from "lucide-react";
import { useMaintenance } from "../contexts/MaintenanceContext";

/**
 * Banner global berisi running text (marquee) yang muncul di semua halaman
 * ketika mode maintenance sedang aktif. Teks diambil dari MaintenanceContext,
 * yang sumbernya adalah tabel `maintenance_settings` di database — tidak ada
 * teks yang di-hardcode di komponen ini.
 */
export const MaintenanceBanner: React.FC = () => {
  const { status, runningText } = useMaintenance();

  if (!status.is_active || !runningText) return null;

  // Duplikasi teks agar marquee terlihat menyambung tanpa celah saat looping
  const trackContent = `${runningText}\u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0`;

  return (
    <div
      role="status"
      className="w-full bg-amber-500/15 border-b border-amber-500/40 text-amber-300 overflow-hidden flex items-center gap-2 px-3 py-2 light_sakura:bg-amber-100 light_sakura:text-amber-700 light_sakura:border-amber-300"
    >
      <AlertTriangle size={14} className="shrink-0" />
      <div className="overflow-hidden flex-1">
        <div
          className="maintenance-marquee-track text-xs font-bold"
          style={{ animationDuration: "18s" }}
        >
          <span>{trackContent}</span>
          <span>{trackContent}</span>
        </div>
      </div>
    </div>
  );
};
