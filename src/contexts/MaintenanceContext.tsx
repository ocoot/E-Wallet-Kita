import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "./LanguageContext";

interface FeatureLock {
  feature_key: string;
  is_locked: boolean;
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
  /** Cek apakah sebuah fitur (berdasarkan feature_key) sedang dikunci admin/owner. */
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

export const MaintenanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { locale } = useLanguage();
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
          locked_features: Array.isArray(data.locked_features) ? data.locked_features : [],
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

    // Dengarkan perubahan realtime dari kedua tabel agar status ter-update
    // langsung di semua client tanpa perlu refresh manual.
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
    (featureKey: string) => {
      if (!status.is_active) return false;
      return status.locked_features.some(f => f.feature_key === featureKey && f.is_locked);
    },
    [status]
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
