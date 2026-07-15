# Rollout useThemeTokens() — Panduan Lanjutan

Status per 2026-07-15: hook + token dasar sudah dibuat. 3 file sudah
direfactor: `src/components/ui/Card.tsx`, `src/components/DashboardWalletCards.tsx`,
dan `src/components/MobileBottomNav.tsx`. Sisanya (~62 file) belum
disentuh — sengaja tidak direfactor sekaligus dalam 1 sesi supaya setiap
perubahan bisa direview & di-test per file, bukan 1 diff raksasa yang
berisiko kalau ada yang salah.

## Temuan penting dari MobileBottomNav.tsx (378 baris, 29 kemunculan `light_sakura:`)

Dari 29 kemunculan di file ini, **hanya 4 yang exact match** dengan token
yang sudah ada (icon aktif/inactive di tombol "Lainnya", label aksen,
ikon ShieldCheck, ikon Volume2). 25 sisanya SENGAJA dibiarkan literal
karena:
- Banyak memakai varian eksplisit `dark_obsidian:` berdampingan dengan
  `light_sakura:` (pola 3-arah, bukan 2 seperti token), mis. baris navbar
  utama & bottom-sheet.
- Banyak shade yang mirip tapi beda satu tingkat dari token yang ada
  (`rose-200` vs token yang cuma punya `rose-100`, `red-500` vs token
  `red-600`, dst) — kalau dipaksa akan mengubah tampilan.
- Beberapa kombinasi (gradient tombol FAB, ring warna, shadow custom)
  memang spesifik 1 tempat, tidak reusable.

**Pelajaran untuk file-file berikutnya:** jangan asumsikan semua file
berdensitas duplikasi setinggi `DashboardWalletCards.tsx`. Komponen kartu/
list (dashboard, wallet cards) polanya memang sangat berulang. Komponen
navigasi/layout (nav bar, sheet, modal) cenderung punya kombinasi warna
custom per elemen — nilai refactornya lebih kecil per file, tapi tetap
menyumbang import + hook yang konsisten dipakai di seluruh app.

## File dengan prioritas tertinggi (jumlah `light_sakura:` per file)

Urutkan pengerjaan dari sini ke bawah:

1. `src/views/Onboarding.tsx` — 150
2. `src/views/Settings.tsx` — 78
3. `src/views/Login.tsx` — 67
4. `src/views/AdminPanel.tsx` — 58
5. `src/views/AdminAiMonitor.tsx` — 50
6. `src/components/SupportChatWidget.tsx` — 47
7. `src/views/AdminBackup.tsx` — 41
8. `src/views/AdminPremiumMonitor.tsx` — 38
9. `src/views/AdminErrorMonitor.tsx` — 38
10. `src/views/BillReminders.tsx` — 34
11. `src/views/AdminCategoryManager.tsx` — 33
12. `src/views/AdminMaintenance.tsx` — 32
13. `src/views/Savings.tsx` / `src/views/NewTransaction.tsx` — 31
14. `src/views/Installments.tsx` / `src/views/GoldSavings.tsx` — 30
15. `src/views/Wallets.tsx` / `src/views/AdminBroadcast.tsx` — 29
   (`MobileBottomNav.tsx` sudah selesai, dulu di posisi ini juga)

Untuk lihat sisa file & angka terbaru, jalankan dari root repo:

```bash
grep -rlo "light_sakura:" src/components src/views | \
  xargs -I{} sh -c 'echo "$(grep -c "light_sakura:" "{}") {}"' | sort -rn
```

## Cara migrasi 1 file (langkah manual per file)

1. Buka file, `grep -n "light_sakura:" <file>` untuk lihat semua titik.
2. Untuk tiap baris, cek dulu apakah kombinasi class-nya PERSIS sama dengan
   salah satu token di `src/lib/theme/tokens.ts`. Kalau ya → ganti ke
   `tokens.<kategori>.<nama>`.
3. Kalau MIRIP tapi tidak persis (beda opacity, beda shade satu tingkat) →
   **jangan dipaksa pakai token yang ada** (itu akan diam-diam mengubah
   tampilan). Tetap literal, atau kalau polanya muncul >2x di file lain juga,
   tambahkan token baru dulu di `tokens.ts` baru dipakai.
4. Tambahkan `const { tokens, cx } = useThemeTokens();` di awal komponen
   (butuh import `useThemeTokens` dari `../hooks/useThemeTokens`).
5. Ganti template string manual (`` `a b ${x} c` ``) dengan `cx(...)` kalau
   sudah ada beberapa token campur literal, supaya tetap rapi.
6. **Wajib**: bandingkan screenshot sebelum/sesudah di kedua tema
   (dark_obsidian & light_sakura) sebelum lanjut ke file berikutnya —
   refactor ini murni tentang lokasi definisi warna, BUKAN tentang ganti
   warna. Kalau ada yang keliatan beda, itu tandanya token yang dipakai
   tidak benar-benar exact match (lihat poin 3).

## Kapan menambah token baru

Tambahkan ke `tokens.ts` HANYA kalau kombinasi tsb muncul di ≥2 file
berbeda. Kombinasi yang cuma dipakai 1 kali di 1 komponen spesifik lebih
baik tetap literal di tempatnya — memaksakannya jadi token generik cuma
menambah lapisan tak berguna dan bikin token map makin gemuk tanpa manfaat
reuse yang nyata.

## Tidak termasuk cakupan refactor ini

`ui/Button.tsx`, `ui/Input.tsx`, `ui/Badge.tsx` SENGAJA tidak diutak-atik.
Ketiganya sudah jadi single source of truth untuk komponennya sendiri
(warna varian button/badge sudah tersentralisasi di 1 file per komponen),
jadi tidak masuk kategori "2000+ duplikasi tersebar" yang jadi masalah
awal. Kalau suatu saat warna varian di file-file itu mau diselaraskan
dengan token semantik (mis. `Button`'s `secondary` variant border memakai
`tokens.border.strong`), itu refactor terpisah dengan risiko yang berbeda
(bisa mengubah tampilan SEMUA tombol sekaligus) — sebaiknya dikerjakan di
sesi sendiri, bukan digabung ke rollout token ini.
