import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        includeAssets: ['logo.png', 'icon-192.png', 'icon-512.png', 'firebase-messaging-sw.js'],
        manifest: {
          name: 'E-Wallet Kita',
          short_name: 'EWK',
          description: 'Aplikasi pencatatan keuangan pribadi rumah tangga dengan pencatatan berbasis AI teks, i18n dwibahasa, dan tema visual instan.',
          start_url: '/',
          display: 'standalone',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          orientation: 'any',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        }
      }),
      // ── Inject Firebase config into the FCM service worker at build time ──
      {
        name: 'inject-fcm-sw',
        closeBundle() {
          const swPath = path.resolve(__dirname, 'dist', 'firebase-messaging-sw.js');
          if (!fs.existsSync(swPath)) return;
          let content = fs.readFileSync(swPath, 'utf-8');
          content = content
            .replace('__FIREBASE_API_KEY__', process.env.VITE_FIREBASE_API_KEY || '')
            .replace('__FIREBASE_AUTH_DOMAIN__', process.env.VITE_FIREBASE_AUTH_DOMAIN || '')
            .replace('__FIREBASE_PROJECT_ID__', process.env.VITE_FIREBASE_PROJECT_ID || '')
            .replace('__FIREBASE_MESSAGING_SENDER_ID__', process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '')
            .replace('__FIREBASE_APP_ID__', process.env.VITE_FIREBASE_APP_ID || '');
          fs.writeFileSync(swPath, content);
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
