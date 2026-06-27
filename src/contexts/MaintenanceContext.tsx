import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "./LanguageContext";
import { useAdminContext } from "./AdminContext";

interface FeatureLock {
  feature_key: string;
  is_locked: boolean;
  /** Jika true, fitur ini TIDAK dikunci di lingkungan dev/sandbox meski is_locked=true. */
  bypass_in_sandbox: boolean;
}

interface MaintenanceStatus {
  is_active: boolean;
  message_id: string;
  message_en: string;
  updated_at: string | null;
  locked_features: FeatureLock[];
}

interface MaintenanceContextType {
  status: MaintenanceStatus;
  loading: boolean;
  /** Pesan running text sesuai bahasa aktif user, sudah dilokalisasi dari DB. */
  runningText: string;
  /**
   * Cek apakah sebuah fitur (berdasarkan feature_key) sedang dikunci.
   *
   * Aturan bypass (TIDAK dikunci walau is_locked=true):
   *  1. Admin / Owner — selalu bypass agar panel tetap bisa dioperasikan.
   *  2. Dev/sandbox (import.meta.env.DEV) — bypass hanya jika kolom
   *     `bypass_in_sandbox` di tabel maintenance_feature_locks = TRUE.
   *     Ini mencegah penguncian global yang tidak sengaja menutup dev env.
   */
  isFeatureLocked: (featureKey: string) => boolean;
  refresh: () => Promise<void>;
}

const DEFAULT_STATUS: MaintenanceStatus = {
  is_active: false,
  message_id: "",
  message_en: "",
  updated_at: null,
  locked_features: [],
};

const MaintenanceContext = createContext<MaintenanceContextType | undefined>(undefined);

/** True saat aplikasi berjalan di lingkungan Vite dev server atau preview AI Studio. */
const IS_SANDBOX = import.meta.env.DEV;

export const MaintenanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { locale } = useLanguage();
  // Baca role dari AdminContext (single source of truth, tidak re-fetch sendiri).
  const { isAdmin, isOwner } = useAdminContext();

  const [status, setStatus] = useState<MaintenanceStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_maintenance_status");
      if (error) {
        console.error("Gagal memuat status maintenance:", error.message);
        return;
      }
      if (data) {
        setStatus({
          is_active: !!data.is_active,
          message_id: data.message_id || "",
          message_en: data.message_en || "",
          updated_at: data.updated_at || null,
          locked_features: Array.isArray(data.locked_features)
            ? data.locked_features.map((f: any) => ({
                feature_key: f.feature_key,
                is_locked: !!f.is_locked,
                bypass_in_sandbox: !!f.bypass_in_sandbox,
              }))
            : [],
        });
      }
    } catch (err) {
      console.error("Exception memuat status maintenance:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    const channel = supabase
      .channel("realtime-maintenance-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_settings" }, () => {
        fetchStatus();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_feature_locks" }, () => {
        fetchStatus();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStatus]);

  const isFeatureLocked = useCallback(
    (featureKey: string): boolean => {
      // 1. Maintenance global tidak aktif → semua fitur terbuka.
      if (!status.is_active) return false;

      const featureLock = status.locked_features.find(f => f.feature_key === featureKey);
      if (!featureLock || !featureLock.is_locked) return false;

      // 2. Admin / Owner selalu bypass — agar panel tetap bisa dioperasikan
      //    dan admin bisa menguji fitur meski sedang dalam mode maintenance.
      if (isAdmin || isOwner) return false;

      // 3. Di lingkungan dev/sandbox, bypass fitur yang ditandai bypass_in_sandbox=true.
      //    Ini memungkinkan tim dev menguji alur tanpa perlu mematikan maintenance global,
      //    sekaligus tetap bisa menguji tampilan gembok untuk fitur tertentu.
      if (IS_SANDBOX && featureLock.bypass_in_sandbox) return false;

      return true;
    },
    [status, isAdmin, isOwner]
  );

  const runningText = locale === "en" ? status.message_en : status.message_id;

  return (
    <MaintenanceContext.Provider
      value={{ status, loading, runningText, isFeatureLocked, refresh: fetchStatus }}
    >
      {children}
    </MaintenanceContext.Provider>
  );
};

export const useMaintenance = () => {
  const context = useContext(MaintenanceContext);
  if (!context) throw new Error("useMaintenance must be used within a MaintenanceProvider");
  return context;
};
