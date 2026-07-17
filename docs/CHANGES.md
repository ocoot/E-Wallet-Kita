# Ringkasan perubahan — Splash Screen (Clean Light · Minimal Ring)

File di dalam zip ini mengikuti struktur folder aslinya, jadi tinggal
di-copy timpa ke root project e-wallet-kita kamu.

## File baru
- `src/components/SplashScreen.tsx`
  Komponen splash screen full-screen varian "Clean Light — Minimal Ring":
  logo + cincin spinner indigo (senada dengan overlay loading logout yang
  sudah ada), nama brand, dan caption. Menghormati `prefers-reduced-motion`
  (spin ring otomatis nonaktif kalau user mengaktifkan setting itu di OS).

## File yang diubah
- `src/App.tsx`
  - Tambah `import { SplashScreen } from "./components/SplashScreen";`
  - Ganti blok `if (loading) { return <div ...>Loading...</div> }` (teks
    polos) menjadi `if (loading) { return <SplashScreen />; }`

- `src/locales/id.json`
  - Tambah key baru `auth.loading_app_desc` = "Memuat isi dompetmu..."

- `src/locales/en.json`
  - Tambah key baru `auth.loading_app_desc` = "Loading your wallet contents..."
    (padanan Inggris, dipakai otomatis kalau user set bahasa app ke EN)

## Cara pakai
1. Extract zip ini.
2. Copy folder `src/` di dalamnya ke root project (timpa file yang sama).
3. Jalankan `npm run dev` / `npm run build` seperti biasa — tidak ada
   dependency baru yang perlu di-install (semua pakai package yang sudah
   ada: `motion`, komponen internal, dan asset logo yang sudah ada).
