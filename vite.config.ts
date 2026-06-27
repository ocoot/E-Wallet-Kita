import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Vite only exposes env to import.meta.env in client code, not to
  // process.env in plugins. Load them explicitly so closeBundle can read them.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        includeAssets: ['logo.png', 'icon-192.png', 'icon-512.png'],
        workbox: {
          // firebase-messaging-sw.js is loaded at runtime by Firebase SDK via
          // importScripts, NOT by the PWA shell — precaching it causes
          // Workbox revision conflicts when inject-fcm-sw replaces its
          // placeholders after the precache manifest is built.
          globIgnores: ['**/firebase-messaging-sw.js*'],
        },
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
            .replace('__FIREBASE_API_KEY__', env.VITE_FIREBASE_API_KEY || '')
            .replace('__FIREBASE_AUTH_DOMAIN__', env.VITE_FIREBASE_AUTH_DOMAIN || '')
            .replace('__FIREBASE_PROJECT_ID__', env.VITE_FIREBASE_PROJECT_ID || '')
            .replace('__FIREBASE_MESSAGING_SENDER_ID__', env.VITE_FIREBASE_MESSAGING_SENDER_ID || '')
            .replace('__FIREBASE_APP_ID__', env.VITE_FIREBASE_APP_ID || '');
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
      hmr: env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
