import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ewk_balance_visible";

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

/**
 * Toggle "mata" show/hide untuk nominal saldo (Saldo Umum, Total Kekayaan,
 * dst). Dibuat sebagai satu hook bersama -- bukan state lokal per kartu --
 * supaya satu tap di kartu manapun langsung menyembunyikan/menampilkan
 * SEMUA nominal saldo di Dashboard sekaligus. Ini pola yang sama dipakai
 * GoPay/OVO/DANA: user yang mau privasi saat layar terlihat orang lain
 * mengharapkan satu toggle, bukan harus tap berkali-kali per kartu.
 *
 * Preferensi disimpan di localStorage (bukan cuma React state) supaya
 * bertahan lintas reload/sesi, dan disinkronkan lintas tab lewat event
 * `storage` bawaan browser.
 */
export function useBalanceVisibility() {
  const [visible, setVisible] = useState<boolean>(() => readStored());

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setVisible(e.newValue === null ? true : e.newValue === "1");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const toggle = useCallback(() => {
    setVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // localStorage tidak tersedia (mis. private mode) -- state React tetap jalan, cuma tidak persist.
      }
      return next;
    });
  }, []);

  return { visible, toggle };
}

/** Ganti tiap digit dalam string Rupiah terformat jadi bullet, sisanya (prefix "Rp", pemisah ribuan) tetap tampil apa adanya supaya lebar teks tidak "meloncat" saat di-toggle. */
export function maskCurrency(formatted: string): string {
  return formatted.replace(/\d/g, "•");
}
