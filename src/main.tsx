import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import {AuthProvider} from './contexts/AuthContext';
import { registerSW } from "virtual:pwa-register";
import { onForegroundFcmMessage, resetFcmState } from "./lib/firebase";
import { cleanupStaleServiceWorkers } from "./lib/swCleanup";

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
onForegroundFcmMessage(({ title, body }) => {
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
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
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
