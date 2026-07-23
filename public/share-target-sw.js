/**
 * share-target-sw.js
 *
 * Di-import lewat `workbox.importScripts` di vite.config.ts, jadi kode ini
 * ikut jalan di dalam Service Worker utama yang di-generate VitePWA
 * (Workbox `generateSW`). Harus vanilla JS (tanpa import/module) karena
 * `importScripts()` classic tidak mendukung ES modules.
 *
 * Tugasnya cuma satu: menangkap POST dari OS Share Sheet ke
 * `/share-target` (didaftarkan lewat `manifest.share_target`), simpan
 * file gambar yang di-share ke IndexedDB, lalu redirect ke halaman
 * "Transaksi Baru" supaya React app yang punya sesi login yang
 * melanjutkan proses OCR-nya. Lihat penjelasan lengkap di
 * `src/lib/shareTarget.ts`.
 */

const SHARE_DB_NAME = "share-target-db";
const SHARE_STORE_NAME = "shared-files";
const SHARE_PENDING_KEY = "pending-receipt";

function openShareDbInSw() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
        db.createObjectStore(SHARE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeSharedFile(file) {
  const db = await openShareDbInSw();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE_NAME, "readwrite");
    tx.objectStore(SHARE_STORE_NAME).put(file, SHARE_PENDING_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") {
    return; // biarkan handler lain (Workbox precache/runtime cache) yang urus
  }

  event.respondWith(
    (async () => {
      try {
        const formData = await event.request.formData();
        const file = formData.get("receipt");
        if (file && file instanceof File && file.size > 0) {
          await storeSharedFile(file);
          return Response.redirect("/transactions/new?shared=1", 303);
        }
        return Response.redirect("/transactions/new", 303);
      } catch (err) {
        return Response.redirect("/transactions/new", 303);
      }
    })()
  );
});
