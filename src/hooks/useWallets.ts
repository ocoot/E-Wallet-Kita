import { useState, useEffect, useCallback } from "react";
import { dbService } from "../lib/db";
import { WalletWithBalance } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { reportFrontendError } from "../lib/errorReporter";

/**
 * Mengambil daftar Pos Dompet (E-Wallet, Rekening, Cash, Saldo Total) milik
 * user beserta saldo yang sudah dihitung. Dipakai di halaman Wallets,
 * NewTransaction (pemilih pos saat mencatat transaksi), dan HistoryEditModal.
 */
export function useWallets() {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!user?.id) {
      setWallets([]);
      setIsLoading(false);
      return;
    }
    // `silent` dipakai untuk refresh LATAR BELAKANG (mis. setelah Top Up /
    // Transfer Saldo di Dashboard, atau setiap kali refreshTrigger global
    // berubah karena transaksi dicatat di halaman lain) -- TIDAK mem-flip
    // `isLoading`, supaya komponen pemanggil yang punya render skeleton
    // saat isLoading=true (mis. DashboardWalletSelectorCard.tsx) TIDAK
    // ikut unmount/remount di tengah aksi. Unmount di tengah aksi itulah
    // yang sebelumnya membuat dialog Top Up/Transfer kembali ke form
    // kosong alih-alih menampilkan layar "Berhasil!"/"Gagal" -- state
    // internal dialog (berupa useState di WalletTopUpModal/
    // WalletTransferModal) ikut hilang begitu parent-nya di-unmount.
    if (!options?.silent) setIsLoading(true);
    setError(null);
    try {
      const data = await dbService.getWallets(user.id);
      setWallets(data);
    } catch (err) {
      console.error("useWallets error:", err);
      void reportFrontendError({
        source: "frontend:wallet",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "useWallets.refresh", silent: !!options?.silent },
      });
      if (!options?.silent) setWallets([]);
      setError(err);
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeWallets = wallets.filter((w) => !w.is_archived);
  const generalWallet = wallets.find((w) => w.type === "general") || null;

  return { wallets, activeWallets, generalWallet, isLoading, error, refresh };
}
