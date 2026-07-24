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
          // Menyuntik `share-target-sw.js` (vanilla JS, lihat file itu untuk
          // penjelasan lengkap) lewat `importScripts()` classic ke dalam SW
          // hasil generate Workbox, supaya bisa menangani POST Web Share
          // Target (`/share-target`) tanpa perlu pindah ke strategi
          // `injectManifest` yang lebih ribet untuk kebutuhan sekecil ini.
          importScripts: ['share-target-sw.js'],
          // Catatan (2026-08-15): dulu ada globIgnores + runtimeCaching
          // NetworkOnly khusus untuk `/changelog.json` di sini -- supaya
          // request ke file itu tidak dijawab dari cache SW lama saat
          // dialog "update tersedia" tampil. Sudah dihapus karena data
          // changelog sekarang disimpan di tabel Supabase
          // `changelog_entries` (lihat src/data/changelog.ts), bukan lagi
          // file statis di public/ -- jadi tidak ada lagi path
          // `/changelog.json` yang perlu dikecualikan dari precache.
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
          // Disamakan dengan warna dark_obsidian (tema default saat pertama
          // install/belum ada preferensi tersimpan): background_color = warna
          // canvas dasar (splash screen sebelum CSS termuat), theme_color =
          // warna awal gradient ribbon (lihat STATUS_BAR_COLOR di
          // ThemeContext.tsx & GRADIENT_CSS di PageRibbonBackground.tsx) --
          // dipakai browser/OS untuk title bar & task switcher saat PWA
          // ter-install standalone. Sebelumnya masih ungu sisa scaffold Vite.
          background_color: '#0A1512',
          theme_color: '#3FBE9B',
          categories: ['finance', 'productivity', 'utilities'],
          // Web Share Target: begitu app ter-install, "E-Wallet Kita" muncul
          // sebagai salah satu pilihan tujuan saat user menekan "Share" di
          // Galeri/WhatsApp/aplikasi lain atas sebuah foto struk -- tidak
          // perlu lagi buka app dulu baru upload manual. Ditangani oleh
          // `public/share-target-sw.js` (lihat file itu & src/lib/shareTarget.ts
          // untuk alur lengkapnya).
          share_target: {
            action: '/share-target',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: {
              files: [{ name: 'receipt', accept: ['image/*'] }],
            },
          },
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
          // screenshot-mobile-home.png (form_factor "narrow") melengkapi
          // sisi mobile (Android Chrome/Samsung Internet menampilkan
          // preview form_factor "narrow" di install prompt/PWA listing).
          screenshots: [
            {
              src: '/screenshot-home.png',
              sizes: '1280x900',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Dashboard E-Wallet Kita',
            },
            {
              src: '/screenshot-mobile-home.png',
              sizes: '1080x2340',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Dashboard E-Wallet Kita (Mobile)',
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