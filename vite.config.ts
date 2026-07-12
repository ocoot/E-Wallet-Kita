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
          id: '/',
          name: 'E-Wallet Kita',
          short_name: 'EWK',
          description:
            'Kelola keuangan pribadi Anda: catat transaksi, atur anggaran, pantau tagihan & cicilan, dan simpan tabungan — semua dalam satu aplikasi.',
          lang: 'id',
          dir: 'ltr',
          start_url: '/dashboard',
          scope: '/',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          orientation: 'portrait-primary',
          background_color: '#0f172a',
          theme_color: '#4f46e5',
          categories: ['finance', 'productivity', 'utilities'],
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // Shortcut aksi cepat: muncul saat user long-press ikon app di
          // homescreen (Android/desktop). Langsung lompat ke fitur yang
          // paling sering dipakai tanpa harus buka dashboard dulu.
          shortcuts: [
            {
              name: 'Tambah Transaksi',
              short_name: 'Transaksi',
              description: 'Catat transaksi baru secara langsung',
              url: '/transactions/new',
              icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Riwayat Transaksi',
              short_name: 'Riwayat',
              description: 'Lihat semua riwayat transaksi',
              url: '/transactions',
              icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Dompet',
              short_name: 'Dompet',
              description: 'Kelola saldo dan dompet Anda',
              url: '/wallets',
              icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
          // Screenshot untuk install prompt yang lebih meyakinkan (terutama
          // di desktop Chrome/Edge, yang menampilkan preview UI sebelum
          // user klik "Install"). form_factor "wide" cocok untuk rasio
          // screenshot-home.png (1280x900, ~4:3 landscape).
          // NOTE: belum ada screenshot form_factor "narrow" (mobile) yang
          // representatif -- sebaiknya ditambahkan menyusul (lihat catatan
          // di respons chat).
          screenshots: [
            {
              src: '/screenshot-home.png',
              sizes: '1280x900',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Dashboard E-Wallet Kita',
            },
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