import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import {AuthProvider} from './contexts/AuthContext';
import { registerSW } from "virtual:pwa-register";
import { onForegroundFcmMessage, resetFcmState } from "./lib/firebase";
import { cleanupStaleServiceWorkers } from "./lib/swCleanup";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { reportFrontendError } from "./lib/errorReporter";

// ── Frontend error capture (tanpa Sentry) ──────────────────────
// Menangkap error yang TIDAK lewat React render tree (jadi tidak
// tertangkap oleh <ErrorBoundary/> di bawah): promise yang reject tanpa
// .catch, dan runtime error di luar siklus render React (mis. di dalam
// event handler atau setTimeout). Dikirim ke error_logs dengan source
// "frontend:unhandled-rejection" / "frontend:runtime".
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error("[unhandledrejection]", reason);
  void reportFrontendError({
    source: "frontend:unhandled-rejection",
    message,
    context: { stack: reason instanceof Error ? reason.stack?.slice(0, 1500) : null },
  });
});

window.addEventListener("error", (event) => {
  // Abaikan resource loading error (gambar/script 404 dll) yang juga
  // memicu event "error" tapi bukan JS runtime error -- event.error
  // hanya terisi untuk JS exception asli.
  if (!event.error) return;
  console.error("[window.onerror]", event.error);
  void reportFrontendError({
    source: "frontend:runtime",
    message: event.error?.message || event.message || "Unknown runtime error",
    context: {
      stack: event.error?.stack?.slice(0, 1500) ?? null,
      filename: event.filename ?? null,
      lineno: event.lineno ?? null,
      colno: event.colno ?? null,
    },
  });
});

// ── Pengaman terhadap cache PWA yang basi ──────────────────────
// Semua view di App.tsx di-lazy-load (React.lazy) sehingga tiap view
// adalah chunk JS terpisah dengan nama file ber-hash. Kalau service worker
// yang SUDAH ter-install di perangkat user masih precache versi LAMA
// (skenario umum: registerType 'prompt' -- lihat main.tsx bawah -- belum
// sempat di-approve user), lalu server sudah menimpa build lama dengan
// yang baru, maka dynamic import() ke chunk lama itu akan gagal (404).
// Vite men-dispatch event "vite:preloadError" untuk kasus ini. Tanpa
// listener ini, kegagalan tsb bisa membuat layar putih kosong tanpa
// penjelasan (persis gejala "PWA tidak bisa dibuka" meski kode sumbernya
// sendiri sehat). Dengan listener ini, begitu terjadi, browser dipaksa
// reload penuh (bypass chunk lama) supaya user otomatis dapat shell+chunk
// terbaru dari network/precache baru.
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[PWA] Gagal memuat chunk (kemungkinan cache lama) -- reload paksa.', event);
  window.location.reload();
});

// Register Service Worker via Vite PWA plugin.
// onNeedRefresh dipanggil saat SW mendeteksi build baru sudah tersedia
// (file precache berubah setelah deploy ke Vercel). Kita simpan fungsi
// updateSW ke window agar bisa dipanggil dari komponen UpdatePrompt,
// lalu dispatch custom event supaya komponen tersebut muncul.
// ── One-time SW cleanup (jalankan sebelum registerSW agar tidak ada race) ──
// Unregister service worker lama yang terdaftar dari sebelum fix
// inject-push-handler.mjs di-deploy. Setelah cleanup, reset in-memory FCM
// state supaya requestFcmToken() di App.tsx resolve ulang dengan registrasi SW
// yang bersih. Flag localStorage mencegah cleanup ini jalan lebih dari sekali
// per browser.
cleanupStaleServiceWorkers((count) => {
  if (count > 0) resetFcmState();
});

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Simpan fungsi update agar bisa dipanggil dari UpdatePrompt
    (window as any).__pwaUpdateSW = updateSW;
    // Beritahu React tree bahwa ada versi baru
    window.dispatchEvent(new CustomEvent("pwa-update-available"));
  },
  onOfflineReady() {
    console.log("[PWA] App siap digunakan secara offline.");
  },
});

// ── FCM foreground notification handler ──────────────────────
// Show a toast-like banner when a push notification arrives while
// the app is open. The toast uses the existing showToast infra
// which is only available inside ToastProvider — we stash the
// payload here and let App.tsx pick it up via a custom event.
//
// Pengecualian: kalau payload push ditandai `data.type === "app_update"`
// (dikirim admin lewat AdminBroadcast → "Beritahu Update Tersedia"),
// jangan tampilkan sebagai toast biasa — langsung tampilkan dialog
// UpdatePrompt yang sama dengan yang muncul otomatis dari service worker,
// supaya pengalamannya konsisten dan user bisa langsung klik "Perbarui".
onForegroundFcmMessage(({ title, body, data }) => {
  if (data?.type === "app_update") {
    window.dispatchEvent(new CustomEvent("pwa-update-available"));
    return;
  }
  if (title || body) {
    window.dispatchEvent(
      new CustomEvent("fcm-foreground-message", {
        detail: { title: title || "E-Wallet Kita", body: body || "" },
      })
    );
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

// Declare global variable for BeforeInstallPromptEvent
declare global {
  interface Window {
    deferredPrompt?: any;
    __pwaUpdateSW?: (reloadPage?: boolean) => Promise<void>;
  }
}

// Global PWA event listeners to capture the install prompt
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent default browser banner
  e.preventDefault();
  // Store prompt event
  window.deferredPrompt = e;
  // Fire custom event so component state can update
  window.dispatchEvent(new CustomEvent('pwa-installable'));
});

window.addEventListener('appinstalled', () => {
  window.deferredPrompt = null;
  window.dispatchEvent(new CustomEvent('pwa-installed'));
  console.log('[PWA] E-Wallet Kita has been installed successfully!');
});
