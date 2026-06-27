/**
 * Firebase Cloud Messaging Service Worker
 *
 * This file is loaded ONLY when the PWA is installed and a push
 * notification arrives while the browser is closed / in background.
 * It is NOT loaded as a module — plain JS, no imports.
 *
 * Import Firebase via importScripts from the CDN.
 * Placeholders (__FIREBASE_*__) are replaced at build time by the
 * inject-fcm-sw Vite plugin in vite.config.ts.
 */

// == CONFIG (injected at build time) ==
const FIREBASE_CONFIG = {
  apiKey: '__FIREBASE_API_KEY__',
  authDomain: '__FIREBASE_AUTH_DOMAIN__',
  projectId: '__FIREBASE_PROJECT_ID__',
  messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__FIREBASE_APP_ID__',
};

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp(FIREBASE_CONFIG);

const messaging = firebase.messaging();

// ── Background message handler ─────────────────────────────────────
// Shows a browser notification when a push arrives while the app is
// closed or running in the background.
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

// ── Notification click handler ─────────────────────────────────────
// When the user clicks a notification, focus an existing window/tab
// or open a new one at the app root.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus an existing app window if one exists
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
