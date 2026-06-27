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
  });
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(c){
    for(var x of c) if(x.url.includes(self.location.origin)&&'focus'in x) return x.focus();
    if(clients.openWindow) return clients.openWindow('/');
  }));
});
