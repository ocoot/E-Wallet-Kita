import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        manifestFilename: 'manifest.json',
        includeAssets: ['logo.png', 'icon-192.png', 'icon-512.png'],
        strategies: 'generateSW',
        workbox: {
          globPatterns: ['**/*.{js,css,png,svg,ico,json,html}'],
          // `changelog.json` SENGAJA dikecualikan dari precache: file ini
          // di-fetch runtime oleh UpdatePrompt.tsx justru untuk mengecek
          // "apa yang baru" pada versi yang BARU di-deploy, saat halaman
          // MASIH menjalankan service worker versi LAMA. Kalau ikut
          // di-precache, request ke /changelog.json akan dicegat & selalu
          // dijawab dari cache milik SW lama itu -- isinya jadi tidak
          // pernah "segar". NetworkOnly di sini memaksa selalu ambil dari
          // server, bukan dari cache SW manapun.
          globIgnores: ['**/changelog.json'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname === '/changelog.json',
              handler: 'NetworkOnly',
            },
          ],
        },
        manifest: {
          name: 'E-Wallet Kita',
          short_name: 'EWK',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': import.meta.dirname || __dirname || '.',
        // Paksa semua import "framer-motion" (termasuk dari sub-dep motion)
        // ke package yang sama, mencegah duplikasi React instance
        'framer-motion': path.resolve('./node_modules/framer-motion'),
        'react': path.resolve('./node_modules/react'),
        'react-dom': path.resolve('./node_modules/react-dom'),
      },
      dedupe: ['react', 'react-dom', 'framer-motion', 'motion'],
    },
    server: {
      hmr: env.DISABLE_HMR !== 'true',
      watch: env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});