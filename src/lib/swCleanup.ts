/**
 * swCleanup.ts
 *
 * One-time cleanup untuk service worker "liar" yang mungkin masih terdaftar
 * di browser user dari sebelum fix inject-push-handler.mjs di-deploy.
 *
 * ── Latar belakang ──────────────────────────────────────────────────────────
 * Sebelum perbaikan, inject-push-handler.mjs menyuntik push event listener
 * ke sw.js (Workbox, scope '/') SELAIN firebase-messaging-sw.js yang juga
 * punya onBackgroundMessage → showNotification.  Dua service worker di scope
 * yang tumpang tindih sama-sama menangani push event yang sama → 2 notifikasi
 * muncul per kejadian.
 *
 * Fix kode (sudah live) mencegah kondisi baru ini terbentuk, TAPI:
 *   1. Setelah deploy, browser user masih jalankan SW LAMA dari cache.
 *      Workbox memang regenerate sw.js baru setiap deploy, tapi proses
 *      update SW di browser adalah asinkron & butuh siklus hidup penuh
 *      (install → waiting → activate) yang bisa memakan waktu sampai user
 *      refresh browser DUA kali.  Selama SW lama masih "waiting", kedua
 *      versi bisa aktif bersamaan di tab berbeda.
 *   2. Ada kasus edge di mana registrasi push subscription dari era lama
 *      (saat getToken() auto-discover sw.js bukannya firebase-messaging-sw.js
 *      karena belum ada explicit registration) masih live di browser,
 *      sehingga browser JUGA meneruskan push event ke sw.js scope '/'
 *      selain ke firebase-messaging-sw.js — menghasilkan 2 notifikasi.
 *
 * ── Pendekatan ──────────────────────────────────────────────────────────────
 * Fungsi cleanupStaleServiceWorkers() dipanggil SEKALI per browser (dijaga
 * dengan flag di localStorage), melakukan:
 *
 *   1. Enumerate semua registrasi SW via navigator.serviceWorker.getRegistrations().
 *   2. Unregister registrasi yang BUKAN salah satu dari dua yang sah:
 *        - sw.js  → scope '/'  (dikelola Workbox/vite-plugin-pwa)
 *        - firebase-messaging-sw.js  → scope '/firebase-cloud-messaging-push-scope/'
 *      Registrasi lain dianggap sisa dari era lama dan di-unregister.
 *   3. Khusus untuk scope '/', periksa scriptURL-nya: kalau bukan sw.js tapi
 *      mengandung kata "firebase" atau "messaging" di luar scope yang benar,
 *      itu juga kandidat unregister.
 *   4. Setelah cleanup, reset cachedToken FCM (lewat exported function dari
 *      firebase.ts) dan set flag 'ewk_sw_cleanup_v1' ke localStorage supaya
 *      cleanup ini TIDAK jalan lagi di reload berikutnya (one-time only).
 *
 * ── Keamanan ────────────────────────────────────────────────────────────────
 * Kalau getRegistrations() gagal (mis. browser tidak support, atau SecurityError
 * di beberapa konteks iOS), fungsi ini silent-fail — app tetap jalan normal.
 * Cleanup yang gagal hanya berarti browser user mungkin masih kena 2 notifikasi
 * beberapa waktu lagi, bukan crash atau data loss.
 */

/** Key localStorage untuk menandai bahwa cleanup sudah pernah jalan di browser ini. */
const CLEANUP_DONE_KEY = 'ewk_sw_cleanup_v1';

/**
 * Scope yang SAH untuk service worker milik app ini.
 * Key = substring yang harus ada di scriptURL, Value = scope yang diharapkan.
 */
const VALID_SW_ENTRIES: Array<{ scriptPattern: RegExp; scope: string }> = [
  {
    // Workbox / vite-plugin-pwa
    scriptPattern: /\/sw\.js(\?.*)?$/,
    scope: '/',
  },
  {
    // Firebase Cloud Messaging
    scriptPattern: /\/firebase-messaging-sw\.js(\?.*)?$/,
    scope: '/firebase-cloud-messaging-push-scope/',
  },
];

/** Kembalikan true kalau registrasi ini adalah salah satu SW yang SAH. */
function isValidRegistration(reg: ServiceWorkerRegistration): boolean {
  const scriptURL = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? '';
  const scopeURL = reg.scope;

  return VALID_SW_ENTRIES.some(({ scriptPattern, scope }) => {
    const scriptMatch = scriptPattern.test(scriptURL);
    const scopeMatch = scopeURL.endsWith(scope) || scopeURL === new URL(scope, location.origin).href;
    return scriptMatch && scopeMatch;
  });
}

/**
 * Bersihkan service worker lama yang tidak lagi relevan dari browser user.
 * Hanya berjalan SEKALI per browser (dijaga flag localStorage).
 *
 * @param onCleanupDone  Callback opsional — dipanggil setelah cleanup selesai
 *                       dengan jumlah registrasi yang di-unregister. Gunakan ini
 *                       untuk reset cachedToken FCM di firebase.ts.
 */
export async function cleanupStaleServiceWorkers(
  onCleanupDone?: (unregisteredCount: number) => void
): Promise<void> {
  // Sudah pernah cleanup di browser ini — tidak perlu jalan lagi.
  if (typeof localStorage !== 'undefined' && localStorage.getItem(CLEANUP_DONE_KEY)) {
    return;
  }

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    let unregisteredCount = 0;

    await Promise.all(
      registrations.map(async (reg) => {
        if (isValidRegistration(reg)) {
          return; // Ini SW yang sah, biarkan.
        }

        const scriptURL =
          reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? '(unknown)';

        console.warn(
          `[SW Cleanup] Unregistering stale service worker: ${scriptURL} (scope: ${reg.scope})`
        );

        try {
          const success = await reg.unregister();
          if (success) {
            unregisteredCount++;
            console.info(`[SW Cleanup] Unregistered: ${scriptURL}`);
          }
        } catch (err) {
          console.warn(`[SW Cleanup] Failed to unregister ${scriptURL}:`, err);
          // Non-fatal, lanjut ke SW lain.
        }
      })
    );

    // Tandai sudah selesai — jangan jalan lagi di reload berikutnya.
    try {
      localStorage.setItem(CLEANUP_DONE_KEY, '1');
    } catch {
      // Ignore (private browsing, storage full, dll).
    }

    if (unregisteredCount > 0) {
      console.info(`[SW Cleanup] Done. ${unregisteredCount} stale registration(s) removed.`);
    }

    onCleanupDone?.(unregisteredCount);
  } catch (err) {
    // getRegistrations() bisa throw SecurityError di beberapa konteks (mis. iOS
    // dalam WKWebView, atau browser yang restrict SW API). Silent-fail — app
    // tetap jalan normal, cleanup hanya tidak terjadi di browser ini.
    console.warn('[SW Cleanup] getRegistrations() failed, skipping cleanup:', err);
  }
}

/**
 * Reset flag cleanup sehingga cleanupStaleServiceWorkers() akan jalan lagi
 * di reload berikutnya.  Hanya perlu dipanggil saat testing/debugging.
 */
export function resetSwCleanupFlag(): void {
  try {
    localStorage.removeItem(CLEANUP_DONE_KEY);
  } catch {
    // Ignore.
  }
}
