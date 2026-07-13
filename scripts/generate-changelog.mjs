#!/usr/bin/env node
/**
 * scripts/generate-changelog.mjs
 * ────────────────────────────────────────────────────────────────────────
 * Dijalankan otomatis oleh `.github/workflows/generate-changelog.yml` tiap
 * ada push ke `main`. Tugasnya:
 *
 *   1. Ambil semua commit git sejak sinkronisasi changelog TERAKHIR
 *      (ditandai lewat git tag ringan `changelog-sync`, bukan disimpan di
 *      database, supaya query "commit mana yang sudah dirangkum" tidak
 *      perlu tabel/state tambahan -- tag ini murni penanda posisi baca
 *      commit, terpisah dari tabel data changelog di Supabase).
 *   2. Kalau tidak ada commit baru sejak tag itu -> keluar tanpa melakukan
 *      apa-apa (exit 0, aman untuk workflow).
 *   3. Kirim daftar pesan commit itu ke Gemini, minta dirangkum jadi
 *      beberapa poin singkat berbahasa AWAM (id + en) -- HANYA yang
 *      benar-benar terasa dampaknya oleh pengguna. Kalau menurut Gemini
 *      tidak ada satupun commit yang relevan buat pengguna (semuanya
 *      refactor/chore/dependency/dst), keluar tanpa mengubah apapun.
 *   4. INSERT entri baru itu ke tabel `changelog_entries` di Supabase
 *      (pakai service_role, bypass RLS -- lihat migration
 *      20260815000000_changelog_entries.sql).
 *
 * PERUBAHAN PENTING (2026-08-15): sebelumnya langkah 4 menulis ke file
 * `public/changelog.json` lalu di-commit/push balik ke git oleh workflow.
 * Itu dihentikan karena setiap kali source di-sync dari Google AI Studio ke
 * GitHub, AI Studio menimpa balik file itu ke versi lama (AI Studio's sync
 * tidak mengenali file yang lahir dari commit bot, dan tidak ada mekanisme
 * ignore resmi untuk sync tersebut). Dengan menulis langsung ke Supabase,
 * tidak ada lagi artefak file di repo yang bisa direbut oleh sync manapun.
 * Script ini sekarang menulis LANGSUNG ke database sendiri (tidak lagi
 * lewat step commit terpisah di workflow) karena kredensialnya
 * (SUPABASE_SERVICE_ROLE_KEY) sudah harus ada sebagai secret di sini,
 * bukan kredensial git.
 *
 * ENV YANG DIBUTUHKAN:
 *   GEMINI_API_KEY             -- key Gemini yang sama yang sudah dipakai di
 *                                 api/_lib/receipt-parser.ts dkk (lihat
 *                                 proses.env fallback di sana:
 *                                 GEMINI_API_KEY || GEMINI_API_KEY_1). Di
 *                                 sini cukup GEMINI_API_KEY saja karena
 *                                 script ini jalan sekali per push, bukan
 *                                 per request pengguna.
 *   SUPABASE_URL                -- sama seperti yang dipakai api/*.ts
 *                                 (process.env.SUPABASE_URL || VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY   -- sama seperti pola di api/admin/broadcast.ts,
 *                                 dipakai supaya insert bisa bypass RLS
 *                                 (satu-satunya jalur tulis ke changelog_entries)
 *
 * Jalan manual untuk testing lokal:
 *   GEMINI_API_KEY=xxxx SUPABASE_URL=xxxx SUPABASE_SERVICE_ROLE_KEY=xxxx \
 *     node scripts/generate-changelog.mjs
 */

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const SYNC_TAG = "changelog-sync";

// Model dipilih dari daftar yang SUDAH dipakai & terbukti jalan di project
// ini (lihat api/parse-transaction.ts) -- flash untuk kecepatan/biaya,
// flash-lite sebagai fallback kalau model utama sedang bermasalah/limit.
// Karena script ini bukan permintaan real-time pengguna (jalan sekali per
// push di CI), timeout dibuat lebih longgar daripada di serverless function.
const MODEL_CANDIDATES = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

// Delimiter aman (karakter kontrol non-printable) untuk memisahkan field &
// record git log -- dipilih supaya tidak mungkin bentrok dengan isi commit
// message manusia biasa (beda dengan pemisah seperti "|" atau "---" yang
// bisa saja muncul di teks commit).
const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";

// Batas panjang body per commit yang dikirim ke Gemini -- cukup untuk
// menangkap penjelasan "kenapa" yang biasa ditulis di body commit project
// ini, tapi tidak sampai memboroskan token untuk body yang sangat panjang
// (mis. commit yang menempel seluruh isi migration SQL di body-nya).
const MAX_BODY_CHARS = 600;

function getCommitsSinceLastSync() {
  // Cek apakah tag sinkronisasi terakhir ada. Kalau belum pernah ada
  // (pertama kali workflow ini jalan di repo), pakai maksimal 50 commit
  // terakhir saja sebagai titik awal supaya tidak memproses SELURUH
  // riwayat repo. `--max-count` dipakai (bukan range `HEAD~50..HEAD`)
  // supaya tetap aman walau repo punya commit kurang dari 50 (range
  // `HEAD~50` akan error kalau history-nya lebih pendek dari itu).
  const format = `%s${FIELD_SEP}%b${RECORD_SEP}`;
  let cmd;
  try {
    sh(`git rev-parse ${SYNC_TAG}`);
    cmd = `git log ${SYNC_TAG}..HEAD --no-merges --pretty=format:"${format}"`;
  } catch {
    console.log(`[changelog] Tag "${SYNC_TAG}" belum ada -- pakai maksimal 50 commit terakhir sebagai titik awal.`);
    cmd = `git log --no-merges --max-count=50 --pretty=format:"${format}"`;
  }

  // %s%b = subject + body. Sebelumnya di sini HANYA subject (%s) dikirim ke
  // Gemini supaya hemat token -- tapi itu bikin Gemini SATU-SATUNYA sinyal
  // yang dia punya adalah prefix/label commit message (mis. "refactor:"),
  // sehingga commit yang LABEL-nya teknis tapi ISI perubahannya sebenarnya
  // terasa oleh user (contoh nyata: "refactor: decouple gold savings from
  // wallet balance" yang sebenarnya mengubah cara Saldo Tersedia dihitung)
  // ikut terlewat padahal seharusnya masuk changelog. Body commit biasanya
  // berisi penjelasan dampak yang lebih lengkap -- itu sinyal yang jauh
  // lebih relevan daripada sekadar prefix.
  // --no-merges supaya commit "Merge branch ..." tidak ikut dihitung.
  let log;
  try {
    log = sh(cmd);
  } catch (err) {
    console.log(`[changelog] Gagal membaca git log (kemungkinan repo baru/shallow clone). Melewati generate changelog kali ini.`);
    return [];
  }

  if (!log) return [];
  return log
    .split(RECORD_SEP)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [subject, body = ""] = record.split(FIELD_SEP);
      const trimmedBody = body.trim();
      return {
        subject: subject.trim(),
        body: trimmedBody.length > MAX_BODY_CHARS
          ? trimmedBody.slice(0, MAX_BODY_CHARS) + "…"
          : trimmedBody,
      };
    })
    .filter((c) => c.subject);
}

function buildPrompt(commits) {
  const list = commits
    .map((c, i) => {
      const bodyPart = c.body ? `\n   Detail: ${c.body.replace(/\n/g, " ")}` : "";
      return `${i + 1}. ${c.subject}${bodyPart}`;
    })
    .join("\n");

  return `Berikut daftar commit (subject + detail/body kalau ada) dari sebuah aplikasi dompet digital (e-wallet) React/PWA bernama "E-Wallet Kita":

${list}

Tugasmu: rangkum HANYA perubahan yang benar-benar akan DIRASAKAN/DISADARI oleh pengguna awam aplikasi ini -- misalnya fitur baru, perbaikan bug yang mereka alami, atau perubahan tampilan/alur/perhitungan yang terlihat di aplikasi (termasuk kalau itu mengubah ANGKA yang ditampilkan ke user, misalnya cara saldo/total dihitung).

PENTING -- nilai dari ISI perubahan (terutama bagian "Detail"), BUKAN dari prefix/label commit message. Commit berlabel "refactor:", "fix:", atau apapun BISA SAJA tetap berdampak ke user kalau isinya menyebutkan perubahan pada apa yang dilihat/dialami user -- jangan diabaikan hanya karena labelnya terdengar teknis. Sebaliknya, ABAIKAN commit yang isinya (bukan cuma labelnya) memang murni internal: rename variabel/file tanpa efek terlihat, update versi dependency/library, perubahan config build/CI, penambahan/perbaikan test, optimisasi performa yang tidak mengubah apapun yang terlihat user, perubahan dokumentasi internal, perbaikan typo di komentar kode.

Kalau ragu apakah suatu perubahan cukup terasa oleh user atau tidak, dan "Detail"-nya menyebutkan sesuatu yang berubah dari sudut pandang user (termasuk perhitungan/angka), LEBIH BAIK dimasukkan daripada dilewatkan.

Kalau SEMUA commit di atas ternyata teknis/internal (tidak ada satupun yang layak diberitahukan ke pengguna), kembalikan array "changes" KOSONG -- jangan dipaksakan mengarang perubahan yang tidak ada.

Tulis tiap poin dalam bahasa yang SANGAT mudah dipahami orang awam (bukan istilah pemrograman), singkat (idealnya di bawah 15 kata), dan dalam DUA bahasa: Indonesia ("id") dan Inggris ("en"). Maksimal 5 poin -- kalau lebih dari 5 perubahan relevan, pilih yang paling penting/berdampak.

Balas HANYA dengan JSON valid, TANPA markdown/backtick, dengan bentuk persis seperti ini:
{"changes": [{"id": "...", "en": "..."}]}`;
}

async function callGemini(apiKey, prompt) {
  const ai = new GoogleGenAI({ apiKey });

  let lastErr;
  for (const model of MODEL_CANDIDATES) {
    try {
      console.log(`[changelog] Memanggil Gemini (model: ${model})...`);
      const response = await ai.models.generateContent({
        model,
        contents: { parts: [{ text: prompt }] },
        config: {
          systemInstruction:
            "Kamu adalah asisten penulis release notes/changelog aplikasi untuk pengguna awam. Selalu balas JSON valid sesuai instruksi, tanpa markdown.",
          responseMimeType: "application/json",
        },
      });

      const parsed = JSON.parse(response.text?.trim() || "{}");
      if (!Array.isArray(parsed.changes)) {
        throw new Error("Response Gemini tidak punya field 'changes' berupa array.");
      }
      return parsed.changes;
    } catch (err) {
      console.warn(`[changelog] Model ${model} gagal: ${err.message || err}`);
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Semua model Gemini gagal dipanggil.");
}

function todayHumanReadable() {
  return new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function bumpVersion(lastVersion) {
  // Versi di sini murni penanda dokumentasi (lihat komentar di changelog.ts),
  // BUKAN sumber kebenaran versi aplikasi -- jadi cukup naikkan angka minor
  // dari entri terakhir. Kalau belum ada entri sama sekali, mulai dari 1.0.0.
  if (!lastVersion) return "1.0.0";
  const parts = lastVersion.split(".").map((n) => parseInt(n, 10) || 0);
  parts[1] = (parts[1] ?? 0) + 1;
  parts[2] = 0;
  return parts.join(".");
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[changelog] GEMINI_API_KEY tidak di-set. Lewati generate changelog (bukan error fatal).");
    process.exit(0); // sengaja exit 0 -- jangan gagalkan seluruh workflow gara-gara changelog opsional
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[changelog] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak di-set. Lewati generate changelog (bukan error fatal).");
    process.exit(0);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const commits = getCommitsSinceLastSync();
  if (commits.length === 0) {
    console.log("[changelog] Tidak ada commit baru sejak sinkronisasi terakhir. Selesai.");
    process.exit(0);
  }

  console.log(`[changelog] Ditemukan ${commits.length} commit baru:`);
  commits.forEach((c) => console.log(`  - ${c.subject}`));

  const { data: lastRow, error: lastRowError } = await supabase
    .from("changelog_entries")
    .select("version")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastRowError) {
    console.error(`[changelog] Gagal membaca entri terakhir dari Supabase: ${lastRowError.message}`);
    console.error("[changelog] Melewati generate changelog kali ini (bukan error fatal untuk workflow).");
    process.exit(0);
  }

  let changes;
  try {
    changes = await callGemini(apiKey, buildPrompt(commits));
  } catch (err) {
    console.error(`[changelog] Gagal memanggil Gemini: ${err.message || err}`);
    console.error("[changelog] Melewati generate changelog kali ini (bukan error fatal untuk workflow).");
    process.exit(0);
  }

  if (!changes || changes.length === 0) {
    console.log("[changelog] Gemini menilai tidak ada perubahan yang layak diberitahukan ke pengguna. Tidak menulis entri baru.");
    process.exit(0);
  }

  const newEntry = {
    version: bumpVersion(lastRow?.version),
    release_date: todayHumanReadable(),
    changes: changes.slice(0, 5), // jaga-jaga kalau model tetap balas lebih dari 5
  };

  const { error: insertError } = await supabase.from("changelog_entries").insert(newEntry);
  if (insertError) {
    console.error(`[changelog] Gagal menulis entri baru ke Supabase: ${insertError.message}`);
    console.error("[changelog] Melewati generate changelog kali ini (bukan error fatal untuk workflow).");
    process.exit(0);
  }

  console.log(`[changelog] Entri baru "${newEntry.version}" ditulis ke tabel changelog_entries:`);
  newEntry.changes.forEach((c) => console.log(`  - ${c.id}`));

  // Pindahkan tag penanda sinkronisasi commit ke HEAD saat ini, supaya run
  // berikutnya tahu dari mana harus mulai membaca commit baru lagi. Ini
  // menggantikan langkah "git tag -f changelog-sync && git push" yang dulu
  // dilakukan workflow SETELAH commit balik -- sekarang dilakukan di sini
  // karena tidak ada lagi commit balik yang perlu ditunggu.
  try {
    sh(`git tag -f ${SYNC_TAG}`);
    sh(`git push origin ${SYNC_TAG} --force`);
    console.log(`[changelog] Tag "${SYNC_TAG}" dipindah ke HEAD saat ini.`);
  } catch (err) {
    console.warn(`[changelog] Gagal memindah tag "${SYNC_TAG}" (bukan error fatal, entri changelog tetap tersimpan): ${err.message || err}`);
  }
}

main().catch((err) => {
  console.error("[changelog] Error tak terduga:", err);
  // Tetap exit 0: fitur changelog otomatis ini best-effort/opsional,
  // jangan sampai menggagalkan seluruh CI/deploy gara-gara ini.
  process.exit(0);
});
