import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

interface AdminContextType {
  isAdmin: boolean;
  isOwner: boolean;
  /** True hanya saat pengecekan role PERTAMA KALI untuk user yang sedang login. */
  loading: boolean;
  refreshAdmin: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  // Menyimpan id user yang sedang di-fetch supaya kita tahu kapan ini benar-benar
  // "user baru login" (perlu reset state) vs cuma "event auth lain" untuk user yang sama
  // (TOKEN_REFRESHED dsb — tidak perlu reset apapun).
  const lastResolvedUserId = useRef<string | null>(null);

  const refreshAdmin = useCallback(async () => {
    if (!userId) {
      setIsAdmin(false);
      setIsOwner(false);
      setLoading(false);
      lastResolvedUserId.current = null;
      return;
    }

    try {
      const { data, error } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();

      if (error) {
        // PENTING: jangan timpa isAdmin/isOwner jadi false di sini.
        // Error semacam ini biasanya transient (network blip, request yang
        // nyangkut di tengah-tengah proses refresh token Supabase, dll).
        // Kalau kita timpa ke false, user yang sah jadi "ditendang" keluar
        // dari Admin Panel walau role-nya sebenarnya tidak berubah.
        console.error("Gagal memuat role admin (mempertahankan status sebelumnya):", error.message);
        return;
      }

      setIsAdmin(data?.role === "admin" || data?.role === "owner");
      setIsOwner(data?.role === "owner");
      lastResolvedUserId.current = userId;
    } catch (err) {
      console.error("Exception saat memuat status admin (mempertahankan status sebelumnya):", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // Hanya benar-benar "reset ke loading" kalau ini user yang berbeda dari
    // yang terakhir kali berhasil di-resolve (login baru / ganti akun / logout).
    // Untuk event auth lain pada user yang sama (mis. TOKEN_REFRESHED, yang
    // terjadi otomatis setiap sesi berjalan cukup lama, termasuk di production),
    // kita tetap refetch di background untuk jaga-jaga role berubah, TANPA
    // menampilkan loading state atau mereset isAdmin/isOwner ke false dulu.
    if (userId !== lastResolvedUserId.current) {
      setLoading(true);
    }
    refreshAdmin();
  }, [userId, refreshAdmin]);

  return (
    <AdminContext.Provider value={{ isAdmin, isOwner, loading, refreshAdmin }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdminContext = () => {
  const context = useContext(AdminContext);
  if (!context) throw new Error("useAdminContext must be used within an AdminProvider");
  return context;
};
