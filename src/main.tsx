import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import {AuthProvider} from './contexts/AuthContext';
import { registerSW } from "virtual:pwa-register";
import { onForegroundFcmMessage } from "./lib/firebase";
import { supabase } from "./lib/supabase";

// Register Service Worker via Vite PWA plugin
registerSW({
  immediate: true,
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
