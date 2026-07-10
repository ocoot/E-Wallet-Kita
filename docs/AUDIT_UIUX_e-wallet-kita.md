# Audit UI/UX & Frontend Engineering — E‑Wallet Kita
**Scope:** `src/` (views, components, contexts, locales) — React + TypeScript + Tailwind v4
**Metode:** Static code audit (grep/AST scan seluruh `.tsx`), bukan visual/manual QA di browser.
**Ringkasan eksekutif:** Aplikasi punya *feature set* yang sangat luas (30+ views, 50+ komponen), tapi **tidak punya design-system primitives** (tidak ada `Button.tsx`, `Card.tsx`, `Input.tsx`, `Badge.tsx`, `Dropdown.tsx` generik). Setiap view menulis ulang style Tailwind sendiri → warna, radius, shadow, dan lebar modal semua berbeda-beda antar file. Temuan paling kritis: **hampir seluruh modal/dialog tidak punya atribut aksesibilitas sama sekali** (`role="dialog"`, `aria-modal`, focus trap, Escape-to-close — nol di semua 10+ modal), dan **custom dropdown (`DropdownField.tsx`) yang menggantikan `<select>` native tidak punya keyboard navigation maupun ARIA sama sekali**.

---

## LAPORAN 1 — Design System & Konsistensi UI

### 1.1 Warna Obsidian (dark) & Sakura (light)
- Tidak ada file token warna terpusat (tidak ada `colors.ts`/`theme.ts`). Skema warna hanya didefinisikan lewat 2 class global di `src/index.css` (`.dark_obsidian`, `.light_sakura`) + Tailwind variant `@variant light_sakura`.
- Warna aksen brand **tidak konsisten**: kombinasi `indigo-500/600` dan `rose-500` dipakai bergantian sebagai "primary action" di view berbeda (mis. `Settings.tsx` pakai `bg-indigo-600` untuk save, tapi `Onboarding.tsx` pakai `bg-rose-500` untuk CTA utama). Tidak jelas mana yang benar-benar "primary brand color" aplikasi.
- Warna semantic (success/danger/warning) juga tidak konsisten unit-nya: kadang `emerald-500`, kadang `emerald-600`; kadang `red-500`, kadang `red-600` untuk aksi destructive yang setara.
- **Severity: High** — tidak ada satu sumber kebenaran warna, risiko drift makin besar seiring app tumbuh.
- **Rekomendasi:** buat `src/design-tokens.ts` atau extend `@theme` di `index.css` dengan token `--color-brand-primary`, `--color-danger`, `--color-success`, `--color-warning`, lalu larang hex/warna Tailwind mentah di luar token ini (bisa dienforce pakai ESLint rule `no-restricted-syntax` untuk classname literal warna).

### 1.2 Typography
- Font sudah baik: satu `--font-sans` (Outfit) + `--font-mono` (JetBrains Mono), dan skala `text-xs`..`text-4xl` dibuat fluid pakai `clamp()` — ini praktik bagus dan terdokumentasi rapi di `index.css`.
- Masalah: penggunaan `font-bold` vs `font-semibold` vs `font-medium` untuk heading level yang sama (mis. judul card) tidak konsisten antar view — beberapa card title pakai `font-bold`, beberapa `font-semibold`.
- **Severity: Low**
- **Rekomendasi:** definisikan util class semantic: `.text-card-title`, `.text-section-title`, dsb via `@layer components`.

### 1.3 Button — **tidak ada komponen `Button.tsx`**
- Tidak ditemukan `src/components/Button.tsx` sama sekali. Setiap `<button>` di 20 view + puluhan komponen ditulis manual dengan className panjang yang di-copy-paste dan sedikit berbeda tiap kali.
- Bukti konkret variasi padding/radius pada button primary antar file (`rounded-xl` vs `rounded-2xl` vs `rounded-lg` dipakai campur untuk elemen yang secara fungsi setara).
- Touch target: hanya `Modal.tsx` yang eksplisit set `min-h-[44px]` pada tombolnya. **0 dari 20 file view** menerapkan minimum touch target 44px secara eksplisit pada button.
- **Severity: Critical** (fondasi seluruh Laporan 1 lainnya)
- **File yang harus diubah:** buat baru `src/components/ui/Button.tsx`, lalu refactor seluruh `<button>` custom di views/components untuk memakainya.
- **Rekomendasi implementasi:**
```tsx
// src/components/ui/Button.tsx
type Variant = "primary" | "secondary" | "danger" | "ghost";
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}
const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-indigo-600 hover:bg-indigo-500 text-white light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400",
  secondary: "bg-slate-800 hover:bg-slate-700 text-white light_sakura:bg-rose-100 light_sakura:text-slate-700",
  danger: "bg-red-600 hover:bg-red-500 text-white",
  ghost: "bg-transparent hover:bg-slate-800 light_sakura:hover:bg-rose-100",
};
export const Button: React.FC<ButtonProps> = ({ variant = "primary", loading, disabled, className = "", children, ...rest }) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={`min-h-[44px] px-4.5 py-2.5 rounded-xl font-sans text-sm font-semibold transition-all
      disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${className}`}
  >
    {loading ? <Spinner size={16} /> : children}
  </button>
);
```

### 1.4 Card — **tidak ada komponen `Card.tsx` generik**
- Yang ada hanya card spesifik-domain: `DashboardOverviewCard.tsx`, `BudgetProgressCard.tsx`, `DashboardWalletCards.tsx`. Tidak ada wrapper `Card` generik untuk container umum.
- Border-radius card berbeda antar view untuk konteks yang setara: `rounded-2xl` (Savings, GoldSavings, Installments) vs `rounded-xl` (Settings, Onboarding, Budget) vs `rounded-3xl` (AdminVoucherManager, sebagian card Dashboard).
- **Severity: High**
- **Rekomendasi:** `src/components/ui/Card.tsx` dengan default `rounded-2xl border border-slate-800 light_sakura:border-rose-100 bg-slate-900 light_sakura:bg-white p-6 shadow-sm`.

### 1.5 Input — tidak ada komponen `Input.tsx`
- Input text/number ditulis manual di tiap form (`NewTransaction.tsx`, `AdminVoucherManager.tsx`, dll) dengan className berbeda-beda: contoh `AdminVoucherManager.tsx` pakai `border-slate-700 ... focus:ring-2 focus:ring-indigo-500`, view lain pakai `focus:border-indigo-500` tanpa ring.
- **Severity: Medium**
- **Rekomendasi:** `src/components/ui/Input.tsx` dengan focus style seragam (`focus:ring-2 focus:ring-indigo-500 focus:border-transparent`) + prop `error` untuk state invalid yang konsisten.

### 1.6 Modal & 1.7 Dialog
- Ada satu `Modal.tsx` generik (dipakai untuk confirm dialog sederhana: danger/warning/info/success) — desainnya sendiri sudah cukup rapi (radius, shadow, warna per-type konsisten).
- **Tapi** ada 9+ modal *custom* terpisah yang tidak memakai `Modal.tsx` sama sekali: `DeleteAccountModal`, `HistoryDeleteModal`, `ExportFullModal`, `ConfirmTransactionModal`, `PremiumModal`, `ResetPasswordModal`, `AdminUserDetailModal`, `VoucherClaimModal`, `ExportSummaryModal`, `HistoryEditModal`. Masing-masing menulis ulang overlay, animasi, dan tombol footer sendiri.
- Lebar (`max-w-*`) tidak konsisten: mayoritas `max-w-md`, tapi `PremiumModal.tsx` pakai `max-w-sm` walau isinya kompleks (berpotensi konten terpotong/cramped).
- Tombol footer (Cancel/Confirm) di modal-modal custom ini punya warna & radius berbeda dari `Modal.tsx` — padahal secara fungsi setara.
- **Severity: Critical**
- **Rekomendasi implementasi:** ekstrak `ModalShell` (overlay + container + animasi + close-on-escape + focus trap) dari `Modal.tsx`, lalu semua modal custom di atas membungkus isinya di dalam `ModalShell`, hanya beda konten body.

### 1.8 Dropdown
- Tidak ada `<select>` native dipakai — sengaja diganti `DropdownField.tsx` custom (alasannya didokumentasikan: `<select>` native gagal di-tap dalam iframe sandbox tertentu). Keputusan ini valid dari sisi kompatibilitas, **tapi mengorbankan aksesibilitas bawaan `<select>` tanpa penggantinya** (lihat Laporan 4).
- **Severity: Critical** (gabungan dengan isu aksesibilitas di §4)

### 1.9 Badge
- Tidak ada komponen `Badge.tsx`. Status pill (mis. "Live"/"Sandbox" di admin, status wallet, kategori) masing-masing ditulis manual dengan kombinasi `rounded-full px-2.5 py-0.5 text-xs` yang berbeda-beda persisnya per file (padding, ukuran font tidak seragam).
- **Severity: Medium**
- **Rekomendasi:** `Badge.tsx` dengan variant `neutral | success | danger | warning | info`.

### 1.10 Icon
- Konsisten pakai `lucide-react` di seluruh app — **baik**. Tapi ukuran icon (`size={16}` vs `size={18}` vs `size={20}` vs `size={22}`) untuk konteks yang setara (mis. icon di dalam button kecil) tidak seragam antar file.
- **Severity: Low**

### 1.11 Spacing
- Tidak ada skala spacing custom didefinisikan — pakai default Tailwind, ini oke. Tapi padding container utama tiap view berbeda (`p-6` vs `p-4` vs `p-8`) tanpa pola breakpoint yang konsisten antar view sejenis (Dashboard vs Wallets vs Budget).
- **Severity: Low**

### 1.12 Border radius
- Sudah dibuktikan di atas (§1.3–1.9): campuran `rounded-lg/xl/2xl/3xl/full` dipakai untuk elemen setara fungsi di file berbeda, tanpa aturan (mis. "card = 2xl, button = xl, badge = full") yang ditegakkan.
- **Severity: High**
- **Rekomendasi:** tetapkan konvensi eksplisit dan dokumentasikan di `CONTRIBUTING.md`:
  - Card/section container → `rounded-2xl`
  - Button/Input → `rounded-xl`
  - Badge/Avatar/Icon chip → `rounded-full`
  - Modal → `rounded-2xl`

### 1.13 Shadow
- `shadow-sm/md/lg/xl/2xl` dipakai campur tanpa pola jelas terkait elevation (mis. card level‑1 harusnya konsisten `shadow-sm`, modal `shadow-2xl`, dropdown panel `shadow-xl`).
- **Severity: Low**

### 1.14 Dark/Light consistency (`dark_obsidian` vs `light_sakura`)
- Pola umumnya baik: mayoritas komponen sudah punya varian `light_sakura:` untuk tiap warna dark. Tapi beberapa file **tidak** punya varian light sama sekali padahal render teks/background gelap secara hardcode — berisiko elemen jadi tak terbaca saat theme `light_sakura` aktif. Contoh yang perlu dicek manual di browser: `DashboardWeatherLayer.tsx`, `EventOverlay.tsx` (banyak warna partikel hardcode tanpa condition tema — walau untuk elemen dekoratif ini risikonya rendah).
- **Severity: Medium**

---

## LAPORAN 2 — UX Flow

### 2.1 Aksi destructive
- Delete account (`DeleteAccountModal.tsx`), delete transaksi (`HistoryDeleteModal.tsx`) sudah punya modal konfirmasi terpisah — **baik**, sesuai prinsip "destructive action harus confirm dulu".
- **Temuan gap:** `Settings.tsx` — 4 aksi async (`executeUpdateProfileName`, `executeUnlinkTelegram`, `handleExportMyData`, `handleGenerateLinkingCode`) **tidak punya state loading sama sekali** (`grep isSubmitting/isLoading` di file ini = 0 match). Tombol tidak di-disable selama request berjalan → risiko **double-submit** (user tap 2x karena tidak ada feedback visual, terutama pada koneksi lambat).
- **Severity: High**
- **File:** `src/views/Settings.tsx`
- **Rekomendasi:**
```tsx
const [isSavingProfile, setIsSavingProfile] = useState(false);

const executeUpdateProfileName = async () => {
  if (isSavingProfile) return;
  setIsSavingProfile(true);
  try {
    // ...existing logic
  } finally {
    setIsSavingProfile(false);
  }
};

// di JSX:
<button disabled={isSavingProfile} onClick={executeUpdateProfileName}>
  {isSavingProfile ? <Spinner size={16} /> : t("common.save")}
</button>
```

### 2.2 Konfirmasi
- Baik untuk delete account/transaksi. Tapi unlink Telegram (`handleUnlinkTelegramClick`) di `Settings.tsx` perlu dicek apakah langsung eksekusi atau lewat modal — jika langsung eksekusi tanpa konfirmasi, ini juga aksi yang cukup signifikan (memutus integrasi bot) dan sebaiknya dikonfirmasi dulu.
- **Severity: Medium**

### 2.3 Loading
- `LoadingOverlay.tsx` dan `SkeletonLoader.tsx` sudah ada sebagai komponen reusable — **baik**, menunjukkan tim sudah sadar butuh loading state.
- Tapi tidak semua view memakainya secara merata — `Settings.tsx` (lihat 2.1) adalah contoh gap paling jelas.
- **Severity: Medium**

### 2.4 Success & 2.5 Error
- Ditangani terpusat lewat `ToastContext.tsx` — desainnya rapi (konfigurasi per-type: warna, durasi, suara, terpusat di satu object `TOAST_CONFIG`). Ini termasuk best practice yang bagus dan sebaiknya dipertahankan sebagai standar untuk seluruh app.
- **Severity: -** (tidak ada temuan negatif signifikan)

### 2.6 Toast
- Sudah punya progress bar shrink + pause-on-hover (CSS-driven, tidak perlu re-render) — implementasi bagus.
- Durasi berbeda per tipe (success 3500ms, error 5500ms) — logis (error butuh waktu baca lebih lama), pertahankan.

### 2.7 Retry
- **Tidak ada pola retry generik.** Hanya ditemukan retry lokal di 3 file terkait voice/premium (`VoiceRecorder.tsx`, `VoicePreview.tsx`, `PremiumModal.tsx`). Untuk fetch data utama (Dashboard, History, Wallets, Budget) **tidak ada tombol "Coba Lagi"** ketika fetch gagal — biasanya hanya fallback ke empty state atau error boundary halaman penuh.
- **Severity: High**
- **Rekomendasi:** buat komponen `ErrorState.tsx` (mirip `EmptyState.tsx` yang sudah ada) dengan tombol retry, dipakai di semua data-fetching view saat request gagal, bukan hanya menampilkan empty state kosong yang menyesatkan (user mengira datanya memang kosong, padahal fetch-nya gagal).

### 2.8 Cancel
- Konsisten tersedia di semua modal (Cancel/Batal button) — baik.

### 2.9 Empty state
- `EmptyState.tsx` sudah reusable dan dipakai di 10 view (`Budget`, `BillReminders`, `Savings`, `Wallets`, `Installments`, `AdminPanel`, dll) serta di `HistoryTable`/`HistoryGroupedList` — **konsisten, baik**.
- **Severity: Low** — hanya perlu cek visual apakah pesan/icon-nya relevan per konteks (mis. pesan generik vs spesifik "belum ada transaksi bulan ini").

### 2.10 Offline state
- **Tidak ada penanganan offline di level aplikasi.** `navigator.onLine`/deteksi offline hanya dipakai lokal untuk fitur cuaca (`WeatherLottie.tsx`, `DashboardWeatherLayer.tsx`) dan auth/error-reporter — **tidak ada banner/indicator global** "Anda sedang offline" yang mencegah user melakukan aksi (mis. submit transaksi) saat koneksi hilang.
- Untuk app finansial (e-wallet), ini penting: transaksi yang gagal terkirim karena offline tapi tidak diberi tahu jelas bisa membuat user mengira transaksi berhasil.
- **Severity: Critical**
- **Rekomendasi:** buat `useOnlineStatus()` hook global + banner persisten (pakai slot z-index `z-[90]` yang sudah didokumentasikan di `index.css` untuk "banner persisten") yang muncul saat `navigator.onLine === false`, dan disable tombol submit transaksi selama offline.

---

## LAPORAN 3 — i18n

### 3.1 Hardcoded string
- **`src/components/WeatherDebugToggle.tsx`** — string Indonesia hardcode langsung di JSX: `"Berkabut"`, `"Gerimis"`, `"Hujan"`, `"Hujan Petir"`, `"Salju"`, `"Debug"` — tidak lewat `t()`. (Catatan: ini kemungkinan komponen debug-only untuk dev, tapi tetap sebaiknya dibersihkan/di-guard dari build produksi kalau memang debug tool.)
- **`src/components/ErrorBoundary.tsx`** — hardcode bilingual manual (deteksi `navigator.language`) alih-alih pakai `t()`. Ini **actually disengaja dan didokumentasikan** dalam komentar kode (boundary ini sengaja diletakkan di luar `LanguageProvider` supaya tetap bisa menangkap crash provider itu sendiri) — jadi bukan bug, tapi tetap dicatat sebagai pengecualian arsitektural yang harus diketahui tim.
- **Severity: Low–Medium**

### 3.2 Translation missing
- **Tidak ditemukan** — perbandingan otomatis `id.json` vs `en.json` (masing-masing 1199 key setelah di-flatten) menunjukkan **0 key hilang** di kedua arah. Struktur key antara ID dan EN 100% paralel. Ini kualitas i18n yang bagus dari sisi kelengkapan struktural.

### 3.3 Translation inconsistent
- Ditemukan **49 key** dengan value ID dan EN yang **identik** (contoh: `admin.order_id`, `admin.status_col`, `admin.sandbox_badge`, `admin.export_csv`, `months.m4`, `months.m9`). Sebagian ini wajar (istilah teknis/angka bulan/label kolom seperti "CSV", "ID" yang memang sama di kedua bahasa), tapi sebagian lain berpotensi **belum benar-benar diterjemahkan** dan perlu direview manual satu per satu (mis. `admin.premium_active`, `admin.telegram_chat_id_label`).
- **Severity: Medium**
- **File:** `src/locales/id.json`, `src/locales/en.json`
- **Rekomendasi:** review manual 49 key ini, tandai mana yang sengaja sama (istilah teknis) vs mana yang lupa diterjemahkan.

### 3.4 Campuran Indonesia–Inggris
- Ditemukan di komentar/kode (bukan UI-facing), tapi ini menandakan risiko: penamaan variabel & komentar campur ID/EN cukup banyak (`isIndonesian`, komentar panjang berbahasa Indonesia di file yang isinya bahasa Inggris seluruhnya) — tidak berdampak ke user tapi ke maintainability.
- Untuk UI-facing string: karena semua view sudah pakai `t()` (58 dari 71 file, sisanya file struktural yang menerima props), risiko campuran bahasa di UI **rendah**, kecuali temuan §3.1.
- **Severity: Low**

### 3.5 Key yang tidak dipakai
- Perlu audit terpisah (butuh cross-reference tiap dari 1199 key terhadap seluruh pemanggilan `t("...")` di codebase) — dari sampling awal ditemukan indikasi key granular seperti `onboarding.savings_mock_target` yang kemungkinan hanya dipakai di 1 tempat spesifik (wajar, bukan unused). **Rekomendasi:** jalankan tooling `i18n-unused` atau script custom untuk daftar key yang benar-benar 0 referensi, sebelum menghapus manual.
- **Severity: Low**

---

## LAPORAN 4 — Accessibility

### 4.1 Keyboard
- **Custom dropdown (`DropdownField.tsx`)**: 0 `onKeyDown` handler ditemukan. Tidak bisa dibuka/dinavigasi dengan keyboard (Arrow Up/Down, Enter, Escape) sama sekali — padahal ini menggantikan `<select>` native yang built-in mendukung keyboard penuh. Dipakai luas lewat `WalletPickerField.tsx` dan form-form lain.
- **Severity: Critical**
- **File:** `src/components/DropdownField.tsx`
- **Alasan UX:** user yang navigasi pakai keyboard (atau screen reader) tidak bisa memilih opsi sama sekali di form manapun yang pakai dropdown ini (kategori transaksi, wallet, brand emas, dll) — blocker penuh.
- **Rekomendasi implementasi:**
```tsx
// tambahkan di trigger button:
<button
  role="combobox"
  aria-expanded={isOpen}
  aria-haspopup="listbox"
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsOpen(o => !o); }
    if (e.key === "Escape") setIsOpen(false);
    if (e.key === "ArrowDown" && !isOpen) setIsOpen(true);
  }}
>
  ...
</button>
// tambahkan di listbox panel:
<div role="listbox">
  {options.map((opt, i) => (
    <div
      role="option"
      aria-selected={opt.value === value}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onChange(opt.value); }}
    >
      {opt.label}
    </div>
  ))}
</div>
```

### 4.2 Focus trap
- **0 dari 10+ modal** (termasuk `Modal.tsx` generik) mengimplementasikan focus trap. Tab bisa "bocor" ke elemen di belakang overlay saat modal terbuka.
- **Severity: Critical**
- **Rekomendasi:** gunakan hook kecil (atau library ringan `focus-trap-react`) yang di-mount di `ModalShell` (lihat §1.6), auto-focus ke tombol pertama saat modal `isOpen`, dan restore focus ke trigger element saat modal ditutup.

### 4.3 aria-label
- Grep menyeluruh: hanya **1 file** (`UpdatePrompt.tsx`) yang punya atribut `aria-*`/`role` — **seluruh modal (10+ file) punya 0 aria-modal / role="dialog" / aria-labelledby**.
- Icon-only button (banyak dipakai untuk close (X), edit, delete di seluruh app) kemungkinan besar juga tidak punya `aria-label` — screen reader user tidak tahu fungsi tombol tersebut.
- **Severity: Critical**
- **File terdampak (sample):** `Modal.tsx`, `DeleteAccountModal.tsx`, `HistoryDeleteModal.tsx`, `ExportFullModal.tsx`, `ConfirmTransactionModal.tsx`, `PremiumModal.tsx`, `ResetPasswordModal.tsx`, `AdminUserDetailModal.tsx`, `VoucherClaimModal.tsx`, `ExportSummaryModal.tsx`, `HistoryEditModal.tsx`
- **Rekomendasi implementasi (contoh `Modal.tsx`):**
```tsx
<motion.div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-desc"
  ...
>
  <h3 id="modal-title">{title}</h3>
  <p id="modal-desc">{description}</p>
```

### 4.4 Contrast
- Perlu verifikasi visual manual (grep tidak bisa menghitung rasio kontras), tapi kombinasi yang berisiko rendah kontras berdasarkan class yang ditemukan: teks `text-slate-500`/`text-slate-400` di atas background terang `light_sakura` (mis. `bg-rose-50`) — kombinasi abu-abu medium di atas putih kemerahan pucat berpotensi di bawah rasio WCAG AA (4.5:1) untuk teks kecil (`text-xs`).
- **Severity: Medium** (perlu verifikasi dengan tool seperti axe DevTools/Lighthouse sebelum dipastikan)
- **Rekomendasi:** jalankan Lighthouse/axe pada tiap view di kedua tema, khususnya `light_sakura`, dan naikkan warna teks sekunder minimal ke `slate-500`/`slate-600` yang sudah diverifikasi kontrasnya di light background.

### 4.5 Screen reader
- Konsekuensi langsung dari §4.1–4.3: pengguna screen reader (NVDA/VoiceOver/TalkBack) akan:
  - Tidak diberi tahu bahwa overlay adalah dialog modal (tidak ada `role="dialog"`).
  - Tidak bisa memilih opsi dropdown custom.
  - Kemungkinan besar tidak tahu fungsi icon-button tanpa label teks.
- **Severity: Critical**
- Ini adalah kategori temuan dengan dampak terbesar di seluruh audit — karena polanya sistemik (bukan 1 file, tapi arsitektur komponen modal & dropdown yang dipakai di seluruh app).

---

## LAPORAN 5 — Responsive

### 5.1 Mobile
- Typography sudah fluid via `clamp()` — bagus untuk layar sangat sempit (<380px).
- Touch target 44px hanya konsisten di `Modal.tsx`; button-button di view (Settings, Wallets, Budget, dll) tidak eksplisit set minimum tinggi — berisiko tap-target terlalu kecil di mobile untuk sebagian tombol icon-only.
- **Severity: Medium**

### 5.2 Tablet
- Tidak ditemukan breakpoint `md:`/`lg:` yang eksplisit di banyak view (mayoritas layout tampak dioptimalkan untuk mobile-first lalu langsung desktop tanpa tablet-specific adjustment) — perlu verifikasi visual di viewport 768–1024px, khususnya untuk tabel lebar (`w-[900px]` di banyak Admin view).

### 5.3 Desktop
- Beberapa modal (`max-w-sm` di `PremiumModal.tsx`) mungkin terlalu sempit untuk konten yang cukup kompleks di desktop — pertimbangkan `max-w-md` agar konsisten dengan modal lain (lihat §1.6).

### 5.4 Overflow
- Tabel lebar di halaman Admin (`AdminPremiumMonitor`, `AdminAiMonitor`, `AdminPanel`, `AdminCategoryManager`, `AdminErrorMonitor`, `AdminVoucherManager`) dan `HistoryTable.tsx` **sudah** dibungkus `overflow-x-auto` / `ScrollableTableWrapper.tsx` dengan `min-w-[...]` — pola ini **sudah benar** dan konsisten. Baik.
- Tidak ditemukan overflow horizontal yang tidak tertangani pada scan ini.
- **Severity: -**

### 5.5 Modal height
- Tidak ditemukan constraint `max-h-[...]` + `overflow-y-auto` yang konsisten di semua modal — perlu dicek manual: modal dengan konten panjang (mis. `ExportFullModal`, `HistoryEditModal`, `AdminUserDetailModal`) apakah akan overflow keluar viewport di layar pendek (mobile landscape / laptop kecil) tanpa scroll internal.
- **Severity: Medium**
- **Rekomendasi:** standar di `ModalShell` (§1.6): `max-h-[85vh] overflow-y-auto` pada container modal.

### 5.6 Scroll issue
- `HistoryTable.tsx` sudah punya indikator scroll (`scroll-mask-x`, `scrolled-end` state) — implementasi bagus untuk memberi tahu user tabel bisa di-scroll horizontal. Pola ini sebaiknya **direplikasi** ke tabel Admin lain yang saat ini hanya pakai `overflow-x-auto` polos tanpa visual affordance bahwa konten bisa di-scroll.
- **Severity: Low**

---

## LAPORAN 6 — File per File (Ringkasan Prioritas)

| # | File | Severity | Isu | Alasan UX | Rekomendasi Singkat |
|---|------|----------|-----|-----------|----------------------|
| 1 | `src/components/DropdownField.tsx` | **Critical** | Tidak ada keyboard nav / ARIA (`role`, `aria-expanded`, `onKeyDown` = 0) | Dropdown dipakai di hampir semua form; user keyboard/screen-reader tidak bisa memilih opsi sama sekali | Tambahkan `role="combobox"`, `role="listbox"/"option"`, handler `onKeyDown` (Enter/Escape/Arrow) |
| 2 | `src/components/Modal.tsx` | **Critical** | Tidak ada `role="dialog"`, `aria-modal`, focus trap, Escape-to-close | Modal ini template dasar dipakai untuk semua confirm dialog — pola tidak-aksesibel akan tercopy ke turunannya | Tambah ARIA attrs + `focus-trap-react` + `onKeyDown` Escape |
| 3 | `DeleteAccountModal.tsx`, `HistoryDeleteModal.tsx`, `ExportFullModal.tsx`, `ConfirmTransactionModal.tsx`, `PremiumModal.tsx`, `ResetPasswordModal.tsx`, `AdminUserDetailModal.tsx`, `VoucherClaimModal.tsx`, `ExportSummaryModal.tsx`, `HistoryEditModal.tsx` | **Critical** | Modal custom, tidak reuse `Modal.tsx`, style tombol/lebar tidak konsisten, tanpa ARIA | Duplikasi kode tinggi, pengalaman visual/aksesibilitas tidak seragam antar modal | Ekstrak `ModalShell` dari `Modal.tsx`, migrasikan semua 10 file ini untuk pakai shell yang sama |
| 4 | `src/views/Settings.tsx` | **High** | 4 aksi async (update profil, unlink Telegram, export data, generate kode) tanpa state loading/disable | Risiko double-submit; user tidak dapat feedback selama request berjalan | Tambah `isSubmitting` per-aksi, disable tombol + tampilkan spinner (lihat contoh kode di §2.1) |
| 5 | *(global — semua view fetch data)* | **Critical** | Tidak ada state offline & tidak ada retry UI generik untuk fetch gagal | Di app finansial, transaksi yang gagal terkirim tanpa notifikasi offline yang jelas bisa disalahartikan user sebagai berhasil | Buat `useOnlineStatus()` + banner global (`z-[90]`) + komponen `ErrorState.tsx` dengan tombol retry |
| 6 | `src/components/WeatherDebugToggle.tsx` | Low | String Indonesia hardcode (`"Berkabut"`, `"Hujan"`, dst), tidak pakai `t()` | Minor — kemungkinan dev-only tool, tapi tetap tidak konsisten dengan pola i18n app | Pindahkan string ke `locales/*.json` atau pastikan komponen ini di-strip dari build produksi |
| 7 | `src/locales/id.json` / `en.json` | Medium | 49 key dengan value ID=EN identik | Sebagian mungkin belum diterjemahkan (perlu review manual, bukan bug otomatis) | Review manual 49 key, terjemahkan yang memang perlu |
| 8 | *(seluruh `src/components/*.tsx`, `src/views/*.tsx` yang punya `<button>`)* | High | Tidak ada komponen `Button.tsx`/`Card.tsx`/`Input.tsx`/`Badge.tsx` bersama; radius/warna/shadow berbeda per file | Biaya maintenance tinggi, inkonsistensi visual makin besar tiap fitur baru ditambah | Bangun `src/components/ui/` (Button, Card, Input, Badge, Dropdown) sesuai contoh kode di Laporan 1, migrasi bertahap per view |
| 9 | Tabel lebar di `AdminPremiumMonitor.tsx`, `AdminAiMonitor.tsx`, `AdminPanel.tsx`, `AdminCategoryManager.tsx`, `AdminErrorMonitor.tsx` | Low | Sudah pakai `ScrollableTableWrapper` tapi tanpa visual scroll-affordance seperti di `HistoryTable.tsx` | User tidak selalu sadar tabel bisa di-scroll horizontal | Terapkan pola `scroll-mask-x` dari `HistoryTable.tsx` ke `ScrollableTableWrapper.tsx` agar konsisten satu tempat |
| 10 | Modal dengan konten panjang: `ExportFullModal.tsx`, `HistoryEditModal.tsx`, `AdminUserDetailModal.tsx` | Medium | Tidak ada `max-h-[85vh] overflow-y-auto` terkonfirmasi di container | Berisiko konten modal terpotong di layar pendek (mobile landscape) | Tambahkan height-constraint + internal scroll di `ModalShell` |

---

## Prioritas Perbaikan yang Disarankan (Roadmap Singkat)

1. **Sprint 1 (Critical, blocker aksesibilitas & UX finansial):**
   - Tambah `role="dialog"` + `aria-modal` + focus trap + Escape-close ke `Modal.tsx` dan semua modal custom (item #1–3).
   - Tambah keyboard nav ke `DropdownField.tsx` (item #1).
   - Tambah offline-state banner + retry UI generik (item #5).
2. **Sprint 2 (High, fondasi design system):**
   - Bangun `src/components/ui/{Button,Card,Input,Badge}.tsx`, migrasi 3–5 view prioritas dulu (Settings, NewTransaction, Wallets).
   - Perbaiki loading-state di `Settings.tsx` (item #4).
3. **Sprint 3 (Medium/Low, polish):**
   - Review 49 key i18n identik, standarkan radius/shadow/warna sesuai konvensi di Laporan 1.13/1.12, verifikasi kontras dengan Lighthouse/axe di tema `light_sakura`.
