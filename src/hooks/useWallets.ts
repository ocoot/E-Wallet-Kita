import { useState, useEffect, useCallback } from "react";
import { dbService } from "../lib/db";
import { WalletWithBalance } from "../types";
import { useAuth } from "../contexts/AuthContext";

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

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setWallets([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await dbService.getWallets(user.id);
      setWallets(data);
    } catch (err) {
      console.error("useWallets error:", err);
      setWallets([]);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeWallets = wallets.filter((w) => !w.is_archived);
  const generalWallet = wallets.find((w) => w.type === "general") || null;

  return { wallets, activeWallets, generalWallet, isLoading, error, refresh };
}
