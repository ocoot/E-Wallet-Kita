import { useEffect } from "react";

/**
 * Set/clear angka merah di icon app di home screen (Android/desktop PWA;
 * belum didukung Safari/iOS per catatan pengetahuan ini dibuat) lewat Badge
 * API (`navigator.setAppBadge` / `clearAppBadge`).
 *
 * Kenapa perlu hook terpisah (bukan langsung panggil di tempat pakainya):
 * Badge API tidak tersedia di semua browser (terutama Safari/iOS & browser
 * desktop lama), jadi setiap pemanggilan WAJIB dibungkus feature-detection +
 * try/catch supaya tidak melempar error di browser yang belum dukung.
 * Disentralkan di sini supaya polanya konsisten dan gampang dipakai ulang
 * (mis. nanti kalau ditambah sumber notifikasi lain seperti chat support).
 *
 * @param count Jumlah yang mau ditampilkan di badge icon. `0` atau
 *   `undefined`/`null` akan MEMBERSIHKAN badge (bukan menampilkan angka 0).
 */
export function useAppBadge(count: number | null | undefined): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) {
      return; // Badge API tidak didukung browser ini — no-op, bukan error.
    }

    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    (async () => {
      try {
        if (!count || count <= 0) {
          await nav.clearAppBadge?.();
        } else {
          await nav.setAppBadge?.(count);
        }
      } catch {
        // Badge API bisa reject di beberapa kondisi platform (mis. app
        // belum ter-install sebagai PWA) — aman untuk diabaikan diam-diam,
        // ini murni progressive enhancement, bukan fitur inti.
      }
    })();
  }, [count]);
}
