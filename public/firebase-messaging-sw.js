/**
 * Firebase Cloud Messaging Service Worker
 *
 * This file is loaded ONLY when the PWA is installed and a push
 * notification arrives while the browser is closed / in background.
 * It is NOT loaded as a module — plain JS, no imports.
 *
 * Import Firebase via importScripts from the CDN.
 * The config is injected at build time via Vite's SW injection or
 * hardcoded here from env.
 */

// == INSTRUCTIONS ==
// Before going live, replace the config below with your Firebase project values.
// These are public values (safe to embed in SW):
const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp(FIREBASE_CONFIG);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'E-Wallet Kita';
  const options = {
    body: payload.notification?.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
  };

  self.registration.showNotification(title, options);
});
