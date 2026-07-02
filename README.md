# Fix: Hydration Error "div cannot be descendant of p"

## Penyebab
`InfoTooltip.tsx` merender `<div>` sebagai elemen root, sementara komponen
ini dipakai di dalam tag `<p>` di `DashboardAccumulatedBalance.tsx` dan
`DashboardStats.tsx`. HTML tidak mengizinkan `<div>` (block content) jadi
anak dari `<p>` (yang cuma boleh berisi phrasing/inline content) — makanya
React kasih warning hydration mismatch.

## Perbaikan
Ganti elemen root & popover di `InfoTooltip.tsx` dari `<div>` jadi `<span>`
(styling & posisi visualnya sama karena class `inline-flex`/`absolute` tetap
dipertahankan, cuma tag HTML-nya yang valid ditaruh di dalam `<p>`).

## Cara pakai
Timpa file ini di project kamu:

```
src/components/InfoTooltip.tsx
```

Tidak perlu ubah file lain — karena `InfoTooltip` dipakai bersama di 3 tempat
(DashboardAccumulatedBalance, DashboardStats), perbaikan di satu file ini
otomatis membereskan semuanya.
