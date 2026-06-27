import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

const FIREBASE_API_KEY = 'AIzaSyATIzHTgl7ShGHG-pOjUFPjtxR8wJXBOPk';
const FIREBASE_AUTH_DOMAIN = 'ewallet-kita.firebaseapp.com';
const FIREBASE_PROJECT_ID = 'ewallet-kita';
const FIREBASE_MESSAGING_SENDER_ID = '591031508771';
const FIREBASE_APP_ID = '1:591031508771:web:b7ef6f4dbb8a75948d7696';

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
