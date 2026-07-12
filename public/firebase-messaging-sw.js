// ── Firebase Cloud Messaging Service Worker ────────────
// This file is loaded by Firebase SDK for background push.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: '__FIREBASE_API_KEY__',
  authDomain: '__FIREBASE_AUTH_DOMAIN__',
  projectId: '__FIREBASE_PROJECT_ID__',
  messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__FIREBASE_APP_ID__',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var title = payload.notification?.title || 'E-Wallet Kita';
  self.registration.showNotification(title, {
    body: payload.notification?.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Simpan payload.data (mis. { type: "app_update" }) di notifikasi
    // supaya notificationclick di bawah tahu konteksnya -- dipakai untuk
    // menandai URL saat app dibuka dari notifikasi "ada pembaruan",
    // supaya app bisa langsung tampilkan indikator "memeriksa
    // pembaruan..." alih-alih diam beberapa detik tanpa penjelasan.
    data: payload.data || {},
  });
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var notifData = e.notification.data || {};
  // Tandai kalau notifikasi ini soal update aplikasi, supaya halaman yang
  // dibuka/difokuskan tahu harus menampilkan indikator "memeriksa
  // pembaruan" sambil menunggu service worker baru siap.
  var updateParam = notifData.type === 'app_update' ? 'ewk_update=1' : null;

  function withUpdateParam(url) {
    if (!updateParam) return url;
    return url + (url.includes('?') ? '&' : '?') + updateParam;
  }

  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(c){
    for (var x of c) {
      if (x.url.includes(self.location.origin) && 'focus' in x) {
        // Tab sudah terbuka: kirim pesan supaya React bisa langsung
        // menampilkan indikator tanpa perlu reload/navigate dulu.
        if (updateParam && 'postMessage' in x) {
          x.postMessage({ type: 'ewk-update-notification-clicked' });
        }
        return x.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(withUpdateParam('/'));
  }));
});
