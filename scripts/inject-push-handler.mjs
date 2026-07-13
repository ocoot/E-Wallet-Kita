import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

// Firebase config is read from the SAME env vars used by src/lib/firebase.ts
// (VITE_FIREBASE_*) so there is a single source of truth. Previously these
// were hardcoded here, duplicating the values in firebase.ts and risking
// the two going out of sync after a Firebase project change. The literal
// fallbacks below only exist so a build doesn't silently produce a broken
// service worker if the env vars are momentarily missing; set the env vars
// in Vercel project settings as the real source.
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY || 'AIzaSyATIzHTgl7ShGHG-pOjUFPjtxR8wJXBOPk';
const FIREBASE_AUTH_DOMAIN = process.env.VITE_FIREBASE_AUTH_DOMAIN || 'ewallet-kita.firebaseapp.com';
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'ewallet-kita';
const FIREBASE_MESSAGING_SENDER_ID = process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '591031508771';
const FIREBASE_APP_ID = process.env.VITE_FIREBASE_APP_ID || '1:591031508771:web:b7ef6f4dbb8a75948d7696';

// Make it obvious at build time whether each value came from the env var
// or silently fell back to the hardcoded default — so a missing/misnamed
// Vercel env var doesn't go unnoticed after a future Firebase project change.
const usedFallback = [
  ['VITE_FIREBASE_API_KEY', !process.env.VITE_FIREBASE_API_KEY],
  ['VITE_FIREBASE_AUTH_DOMAIN', !process.env.VITE_FIREBASE_AUTH_DOMAIN],
  ['VITE_FIREBASE_PROJECT_ID', !process.env.VITE_FIREBASE_PROJECT_ID],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', !process.env.VITE_FIREBASE_MESSAGING_SENDER_ID],
  ['VITE_FIREBASE_APP_ID', !process.env.VITE_FIREBASE_APP_ID],
].filter(([, missing]) => missing).map(([name]) => name);

if (usedFallback.length > 0) {
  console.warn(`[inject] Env var(s) not set, using hardcoded fallback for: ${usedFallback.join(', ')}`);
} else {
  console.log('[inject] All Firebase config read from VITE_FIREBASE_* env vars');
}

// ── sw.js (Workbox) intentionally does NOT get a push handler ──
//
// ROOT CAUSE FIX (duplicate push notifications): this script used to
// ALSO append a raw `push` event listener into sw.js that called
// self.registration.showNotification(...). Combined with
// firebase-messaging-sw.js below (which uses messaging.onBackgroundMessage
// to do the exact same showNotification call), every single FCM push
// message was being displayed TWICE — once by each service worker,
// both registered at overlapping scope for the same origin.
//
// firebase-messaging-sw.js is the correct, single owner of push display
// logic for this app. sw.js (Workbox/vite-plugin-pwa) should stay focused
// on asset caching/PWA install behavior only. If you need sw.js to keep
// `skipWaiting()` on install, add that separately — just never re-add a
// `push` listener here.
const swPath = path.resolve(distDir, 'sw.js');
if (fs.existsSync(swPath)) {
  console.log('[inject] ℹ Skipped push handler injection into sw.js (handled solely by firebase-messaging-sw.js to avoid duplicate notifications)');
}

// ── Create firebase-messaging-sw.js with proper Firebase init ──
const fcmPath = path.resolve(distDir, 'firebase-messaging-sw.js');
const fcmCode = `// ── Firebase Cloud Messaging Service Worker ────────────
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: '${FIREBASE_API_KEY}',
  authDomain: '${FIREBASE_AUTH_DOMAIN}',
  projectId: '${FIREBASE_PROJECT_ID}',
  messagingSenderId: '${FIREBASE_MESSAGING_SENDER_ID}',
  appId: '${FIREBASE_APP_ID}',
});
var messaging=firebase.messaging();
messaging.onBackgroundMessage(function(p){
  var data=p.data||{};
  self.registration.showNotification(p.notification?.title||'E-Wallet Kita',{
    body:p.notification?.body||'',
    icon:'/icon-192.png',
    badge:'/icon-192.png',
    data:data,
  });
});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  var isAppUpdate=e.notification.data&&e.notification.data.type==='app_update';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(c){
    for(var x of c){
      if(x.url.includes(self.location.origin)&&'focus'in x){
        // Untuk notifikasi update versi: fokus tab yang ada LALU reload
        // supaya user langsung mendapat build terbaru, bukan cuma
        // membuka kembali tab lama yang masih menjalankan versi lama.
        if(isAppUpdate&&'navigate'in x){
          return x.focus().then(function(){return x.navigate(x.url);});
        }
        return x.focus();
      }
    }
    if(clients.openWindow)return clients.openWindow('/');
  }));
});
`;
fs.writeFileSync(fcmPath, fcmCode);
console.log('[inject] Created firebase-messaging-sw.js with Firebase config');
