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

// ── Inject push handler into Workbox-generated sw.js ──
const swPath = path.resolve(distDir, 'sw.js');
if (fs.existsSync(swPath)) {
  const code = `
self.addEventListener('push',function(e){if(!e.data)return;try{var p=e.data.json();var d=p.notification||p.data||p;e.waitUntil(self.registration.showNotification(d.title||'E-Wallet Kita',{body:d.body||'',icon:'/icon-192.png',badge:'/icon-192.png'}))}catch(_){}});
self.addEventListener('notificationclick',function(e){e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(c){for(var x of c)if(x.url.includes(self.location.origin)&&'focus'in x)return x.focus();if(clients.openWindow)return clients.openWindow('/');}))});
self.addEventListener('install',function(){self.skipWaiting()});
`;
  fs.appendFileSync(swPath, code);
  console.log('[inject] ✅ Push handler → sw.js');
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
messaging.onBackgroundMessage(function(p){self.registration.showNotification(p.notification?.title||'E-Wallet Kita',{body:p.notification?.body||'',icon:'/icon-192.png',badge:'/icon-192.png'});});
self.addEventListener('notificationclick',function(e){e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(c){for(var x of c)if(x.url.includes(self.location.origin)&&'focus'in x)return x.focus();if(clients.openWindow)return clients.openWindow('/');}));});
`;
fs.writeFileSync(fcmPath, fcmCode);
console.log('[inject] ✅ Created firebase-messaging-sw.js with Firebase config');
