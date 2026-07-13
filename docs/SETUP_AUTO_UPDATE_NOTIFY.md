# Setup: Notifikasi Update Otomatis (Auto Web Push saat Deploy)

Fitur ini mengirim push notification "Pembaruan Tersedia" ke SEMUA user
secara otomatis setiap kali kamu push ke branch `main` DAN deployment
Vercel-nya sukses (READY). Kalau build gagal atau timeout, notifikasi
TIDAK dikirim — jadi aman, user tidak akan disuruh update ke versi yang
belum benar-benar live.

## 1. Generate secret baru

Buat string acak (jangan dipakai ulang dari secret lain), contoh lewat terminal:

```bash
openssl rand -hex 32
```

Simpan hasilnya — ini akan dipakai di 2 tempat (harus SAMA PERSIS):

## 2. Tambahkan ke Vercel (Environment Variables)

Project Settings → Environment Variables → tambahkan:

| Key                    | Value                          | Environment |
|-------------------------|---------------------------------|--------------|
| `UPDATE_NOTIFY_SECRET`  | (hasil `openssl rand -hex 32`) | Production   |

## 3. Tambahkan ke GitHub (Repo Secrets)

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret name             | Value                                                              |
|--------------------------|---------------------------------------------------------------------|
| `UPDATE_NOTIFY_SECRET`  | Sama persis dengan yang di Vercel (langkah 2)                      |
| `APP_URL`               | URL production, mis. `https://e-wallet-kita.vercel.app` (tanpa trailing slash) |
| `VERCEL_TOKEN`          | Buat di https://vercel.com/account/tokens (scope: read deployments) |
| `VERCEL_PROJECT_ID`     | Project Settings → General → "Project ID"                          |
| `VERCEL_TEAM_ID`        | Hanya kalau project ini di bawah Team/Org (Settings → General → "Team ID"). Kosongkan kalau personal account. |

## 4. Selesai — cara kerjanya

1. Kamu `git push` ke `main` seperti biasa.
2. Vercel otomatis build & deploy (seperti sekarang, tidak berubah).
3. GitHub Actions (`.github/workflows/notify-update.yml`) jalan paralel:
   - Polling status deployment lewat Vercel API tiap 15 detik (maks 10 menit).
   - Begitu status `READY`, langsung POST ke `/api/admin/broadcast` dengan
     header rahasia `x-update-secret`.
   - Endpoint mengirim push ke semua device terdaftar dengan tag
     `data.type = "app_update"`.
4. Di sisi user:
   - **App tertutup** → dapat notifikasi OS asli; diklik → tab
     fokus lalu auto-reload ke versi terbaru.
   - **App sedang dibuka** → langsung muncul dialog "Pembaruan Tersedia"
     di tengah layar (sama seperti yang dipicu otomatis oleh service worker).

## 5. Kontrol manual (opsional)

- **Skip notifikasi untuk 1 deploy tertentu** (mis. cuma ganti copy text):
  tambahkan `[skip-notify]` di pesan commit.
- **Trigger manual tanpa push commit**: buka tab *Actions* di GitHub →
  pilih workflow "Notify Users on Update" → *Run workflow*.
- **Kirim manual dengan pesan custom** (tetap tersedia): Admin Panel →
  Broadcast → tombol "Beritahu Update Tersedia" (bisa edit judul/isi).

## Keamanan

- `UPDATE_NOTIFY_SECRET` dibandingkan pakai constant-time comparison
  (`crypto.timingSafeEqual`) di server, bukan `===` biasa, untuk mencegah
  timing attack.
- Percobaan dengan secret yang salah otomatis tercatat di Admin Panel →
  Monitor Error (source: `admin/broadcast:system-auth`) sebagai sinyal
  keamanan.
- Jalur ini SENGAJA dikunci hanya bisa kirim push bertanda
  `app_update` — tidak bisa dipakai untuk broadcast Telegram atau pesan
  bebas lain, jadi kalau secret ini bocor, blast radius-nya terbatas
  (paling parah: seseorang bisa spam notifikasi "update tersedia" palsu,
  bukan mengakses data atau mengirim pesan sembarangan).
- Kalau merasa secret bocor, tinggal generate ulang dan update di kedua
  tempat (Vercel + GitHub) — endpoint lain tidak terpengaruh.
