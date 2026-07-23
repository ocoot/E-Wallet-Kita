/**
 * shareTarget.ts
 *
 * Jembatan antara `public/share-target-sw.js` (Service Worker, vanilla JS,
 * tidak bisa import modul TS) dengan aplikasi React ini, lewat satu object
 * store IndexedDB kecil bernama `share-target-db`.
 *
 * Alur lengkap "Share foto struk dari Galeri/WhatsApp ke E-Wallet Kita":
 *   1. User menekan "Share" di app lain (Galeri, WhatsApp, dsb) pada
 *      sebuah foto, lalu memilih "E-Wallet Kita" dari daftar target share
 *      OS -- ini didaftarkan lewat `manifest.share_target` (vite.config.ts).
 *   2. Browser melakukan POST (multipart/form-data) ke `/share-target`.
 *      Request ini DICEGAT oleh Service Worker (`share-target-sw.js`,
 *      di-`importScripts` dari SW utama hasil generate VitePWA) --
 *      bukan diteruskan ke jaringan, karena app ini adalah SPA statis
 *      tanpa endpoint server yang bisa memproses form-data tsb, dan lebih
 *      penting lagi: SW tidak punya akses ke sesi login Supabase user
 *      (disimpan di localStorage tab, bukan cookie), jadi file harus
 *      "dititipkan" dulu ke sini, BUKAN diproses/di-upload langsung dari
 *      dalam SW.
 *   3. SW menyimpan File yang di-share ke IndexedDB (lewat fungsi di
 *      bawah, versi vanilla JS-nya ada di share-target-sw.js), lalu
 *      me-redirect browser ke `/transactions/new?shared=1`.
 *   4. Halaman NewTransaction (lihat `useSharedReceipt` di hook ini)
 *      mendeteksi query `?shared=1`, mengambil File dari IndexedDB lewat
 *      `getPendingSharedFile()`, menyerahkannya ke alur OCR struk yang
 *      SAMA PERSIS dengan upload manual (jadi otomatis kena semua
 *      validasi premium/lock/ukuran yang sudah ada), lalu membersihkan
 *      IndexedDB & query string.
 */

const DB_NAME = "share-target-db";
const STORE_NAME = "shared-files";
const PENDING_KEY = "pending-receipt";

function openShareDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Dipanggil dari NewTransaction.tsx setelah redirect `?shared=1`. */
export async function getPendingSharedFile(): Promise<File | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openShareDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(PENDING_KEY);
      req.onsuccess = () => resolve((req.result as File) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Bersihkan entry setelah file berhasil "diambil-alih" oleh React app. */
export async function clearPendingSharedFile(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openShareDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(PENDING_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // no-op — kalau gagal dibersihkan, entry lama akan ditimpa share berikutnya
  }
}
