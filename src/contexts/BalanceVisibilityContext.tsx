import React, { createContext, useContext, useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ewk_balance_visible";

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

interface BalanceVisibilityContextType {
  visible: boolean;
  toggle: () => void;
}

const BalanceVisibilityContext = createContext<BalanceVisibilityContextType | null>(null);

/**
 * Satu sumber kebenaran untuk status show/hide SELURUH nominal di Dashboard
 * (Saldo per Pos Dompet, Total Kekayaan, ringkasan Bulan Ini, rincian aset,
 * jatah anggaran harian, progres budget, chart, riwayat transaksi terbaru).
 *
 * Sebelumnya ini adalah hook biasa (`useBalanceVisibility`) yang dipanggil
 * berulang di tiap komponen (DashboardWalletCards, DashboardOverviewCard,
 * dst). Itu membuat setiap komponen punya `useState` sendiri-sendiri --
 * secara teknis "disinkronkan" lewat localStorage + event `storage`, tapi
 * event `storage` browser TIDAK pernah terpicu di tab/dokumen yang sama
 * yang melakukan perubahan (hanya di tab lain). Akibatnya: tap ikon mata di
 * satu kartu tidak langsung mengubah kartu lain di layar yang sama sampai
 * halaman di-reload -- inilah sumber kesan "toggle-nya aneh/tidak
 * konsisten". Dengan React Context, semua konsumer berbagi satu instance
 * state yang sama, jadi satu tap langsung ter-apply ke semua nominal secara
 * instan, tanpa delay atau reload. localStorage tetap dipakai supaya
 * preferensi bertahan lintas reload/sesi, dan tetap disinkronkan ke tab
 * LAIN lewat event `storage` seperti sebelumnya.
 */
export function BalanceVisibilityProvider({ children }: { children: React.ReactNode }) {
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

  return (
    <BalanceVisibilityContext.Provider value={{ visible, toggle }}>
      {children}
    </BalanceVisibilityContext.Provider>
  );
}

/** Baca & ubah status show/hide nominal. Harus dipakai di dalam `<BalanceVisibilityProvider>`. */
export function useBalanceVisibility(): BalanceVisibilityContextType {
  const ctx = useContext(BalanceVisibilityContext);
  if (!ctx) {
    throw new Error("useBalanceVisibility must be used within a BalanceVisibilityProvider");
  }
  return ctx;
}

/**
 * Ganti SELURUH nominal (digit + pemisah ribuan/desimal) dalam string
 * Rupiah terformat jadi deretan titik tengah (·) yang seragam, sisanya
 * (prefix "Rp") tetap tampil apa adanya.
 *
 * REVISI: sebelumnya cuma digit yang di-mask (pakai bullet besar "●"),
 * sengaja MENYISAKAN titik pemisah ribuan asli supaya lebar teks tetap
 * merepresentasikan struktur nominal (mis. "Rp ●●●.●●●"). Diubah atas
 * permintaan langsung -- sekarang pemisah ribuan IKUT di-mask jadi titik
 * seragam yang sama (mis. "Rp ·······"), supaya nominal yang disembunyikan
 * benar-benar tidak membocorkan struktur/jumlah digit aslinya sama sekali.
 */
export function maskCurrency(formatted: string): string {
  return formatted.replace(/[\d.,]/g, "·");
}

/**
 * Untuk kalimat naratif yang MENGANDUNG nominal di tengah teks (mis. teks
 * sapaan "Jatah aman harian ± Rp 298.684 (...)"), bukan nominal yang berdiri
 * sendiri. Memakai regex untuk mem-blur hanya token yang terlihat seperti
 * nominal Rupiah (opsional "Rp" + digit + pemisah ribuan), tanpa
 * mempengaruhi angka lain di kalimat yang sama (mis. "19 hari", "5%").
 */
export function maskCurrencyInText(text: string): string {
  return text.replace(/(Rp\s?[\d.,]*\d)/g, (m) => maskCurrency(m));
}
