# Ringkasan Perubahan — Konsolidasi Endpoint Vercel (12 → 9)

## File BARU (tambahkan ke project)
- `api/receipt.ts` — gabungan `parse-receipt.ts` + `send-receipt.ts`
  - `POST /api/receipt?action=parse`
  - `POST /api/receipt?action=send`
- `api/parse.ts` — gabungan `parse-transaction.ts` + `parse-voice.ts`
  - `POST /api/parse?type=text`
  - `POST /api/parse?type=voice`
- `api/utils.ts` — gabungan `health.ts` + `weather.ts`
  - `GET /api/utils?type=health`
  - `GET /api/utils?type=weather&lat=..&lon=..`

## File yang HARUS DIHAPUS dari project (sudah digantikan file baru di atas)
- `api/parse-receipt.ts`
- `api/send-receipt.ts`
- `api/parse-transaction.ts`
- `api/parse-voice.ts`
- `api/health.ts`
- `api/weather.ts`

## File yang DIUBAH (timpa versi lama dengan yang ada di zip ini)
- `server.ts` — mount route dev server disesuaikan ke 3 endpoint baru
- `api/_lib/voice-transcriber.ts` — hanya komentar, path lama diperbarui
- `src/components/ReceiptUploader.tsx` — fetch ke `/api/receipt?action=parse`
- `src/lib/email.ts` — fetch ke `/api/receipt?action=send`
- `src/components/VoiceRecorder.tsx` — fetch ke `/api/parse?type=voice` & `/api/parse?type=text`
- `src/hooks/useWeather.ts` — fetch ke `/api/utils?type=weather`
- `src/components/DashboardHeader.tsx` — hanya komentar
- `src/index.css` — hanya komentar

## Langkah setelah extract
1. Timpa (overwrite) file-file di atas ke project Anda, sesuai struktur folder di zip ini.
2. Hapus 6 file lama yang disebutkan di atas.
3. Jalankan `npm run build` / `npm run dev` untuk memastikan tidak ada import yang patah.
4. Test manual: pindai struk, kirim struk email, catat via suara, catat via teks, widget cuaca.
