#!/usr/bin/env node
/**
 * scripts/generate-changelog.mjs
 * ────────────────────────────────────────────────────────────────────────
 * Dijalankan otomatis oleh `.github/workflows/generate-changelog.yml` tiap
 * ada push ke `main`. Tugasnya:
 *
 *   1. Ambil semua commit git sejak sinkronisasi changelog TERAKHIR
 *      (ditandai lewat git tag ringan `changelog-sync`, bukan disimpan di
 *      database, supaya tidak perlu koneksi ke Supabase dari sini).
 *   2. Kalau tidak ada commit baru sejak tag itu -> keluar tanpa melakukan
 *      apa-apa (exit 0, aman untuk workflow).
 *   3. Kirim daftar pesan commit itu ke Gemini, minta dirangkum jadi
 *      beberapa poin singkat berbahasa AWAM (id + en) -- HANYA yang
 *      benar-benar terasa dampaknya oleh pengguna. Kalau menurut Gemini
 *      tidak ada satupun commit yang relevan buat pengguna (semuanya
 *      refactor/chore/dependency/dst), keluar tanpa mengubah apapun.
 *   4. Tulis entri baru itu ke PALING ATAS array di `public/changelog.json`.
 *   5. Repo TIDAK di-commit/push oleh script ini -- itu dilakukan oleh
 *      workflow (lihat generate-changelog.yml) supaya kredensial git tetap
 *      dikelola di level workflow, bukan di script.
 *
 * ENV YANG DIBUTUHKAN:
 *   GEMINI_API_KEY   -- key Gemini yang sama yang sudah dipakai di
 *                       api/_lib/receipt-parser.ts dkk (lihat proses.env
 *                       fallback di sana: GEMINI_API_KEY || GEMINI_API_KEY_1).
 *                       Di sini kita pakai GEMINI_API_KEY saja karena
 *                       script ini jalan sekali per push, bukan per
 *                       request pengguna, jadi tidak perlu rotasi banyak
 *                       key seperti di serverless function.
 *
 * Jalan manual untuk testing lokal:
 *   GEMINI_API_KEY=xxxx node scripts/generate-changelog.mjs
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

const CHANGELOG_JSON_PATH = new URL("../public/changelog.json", import.meta.url);
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

function getCommitsSinceLastSync() {
  // Cek apakah tag sinkronisasi terakhir ada. Kalau belum pernah ada
  // (pertama kali workflow ini jalan di repo), pakai maksimal 50 commit
  // terakhir saja sebagai titik awal supaya tidak memproses SELURUH
  // riwayat repo. `--max-count` dipakai (bukan range `HEAD~50..HEAD`)
  // supaya tetap aman walau repo punya commit kurang dari 50 (range
  // `HEAD~50` akan error kalau history-nya lebih pendek dari itu).
  let cmd;
  try {
    sh(`git rev-parse ${SYNC_TAG}`);
    cmd = `git log ${SYNC_TAG}..HEAD --no-merges --pretty=format:%s`;
  } catch {
    console.log(`[changelog] Tag "${SYNC_TAG}" belum ada -- pakai maksimal 50 commit terakhir sebagai titik awal.`);
    cmd = `git log --no-merges --max-count=50 --pretty=format:%s`;
  }

  // %s = subject saja (tanpa body, supaya token ke Gemini tidak boros dan
  // tidak ikut menyeret detail teknis panjang di body commit).
  // --no-merges supaya commit "Merge branch ..." tidak ikut dihitung.
  let log;
  try {
    log = sh(cmd);
  } catch (err) {
    console.log(`[changelog] Gagal membaca git log (kemungkinan repo baru/shallow clone). Melewati generate changelog kali ini.`);
    return [];
  }

  if (!log) return [];
  return log.split("\n").map((line) => line.trim()).filter(Boolean);
}

function buildPrompt(commitSubjects) {
  const list = commitSubjects.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `Berikut daftar commit message dari sebuah aplikasi dompet digital (e-wallet) React/PWA bernama "E-Wallet Kita":

${list}

Tugasmu: rangkum HANYA perubahan yang benar-benar akan DIRASAKAN/DISADARI oleh pengguna awam aplikasi ini -- misalnya fitur baru, perbaikan bug yang mereka alami, atau perubahan tampilan/alur pemakaian.

ABAIKAN sepenuhnya commit yang sifatnya teknis/internal, contoh: refactor, rename variabel/file, update dependency/library, perubahan config build/CI, penambahan/perbaikan test, optimisasi kode yang tidak terlihat pengguna, perubahan dokumentasi internal, perbaikan typo di komentar kode.

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

function bumpVersion(currentChangelog) {
  // Versi di sini murni penanda dokumentasi (lihat komentar di changelog.ts),
  // BUKAN sumber kebenaran versi aplikasi -- jadi cukup naikkan angka minor
  // dari entri terakhir. Kalau belum ada entri sama sekali, mulai dari 1.0.0.
  const last = currentChangelog[0]?.version;
  if (!last) return "1.0.0";
  const parts = last.split(".").map((n) => parseInt(n, 10) || 0);
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

  const commitSubjects = getCommitsSinceLastSync();
  if (commitSubjects.length === 0) {
    console.log("[changelog] Tidak ada commit baru sejak sinkronisasi terakhir. Selesai.");
    process.exit(0);
  }

  console.log(`[changelog] Ditemukan ${commitSubjects.length} commit baru:`);
  commitSubjects.forEach((s) => console.log(`  - ${s}`));

  const currentChangelog = existsSync(CHANGELOG_JSON_PATH)
    ? JSON.parse(readFileSync(CHANGELOG_JSON_PATH, "utf8"))
    : [];

  let changes;
  try {
    changes = await callGemini(apiKey, buildPrompt(commitSubjects));
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
    version: bumpVersion(currentChangelog),
    date: todayHumanReadable(),
    changes: changes.slice(0, 5), // jaga-jaga kalau model tetap balas lebih dari 5
  };

  const updated = [newEntry, ...currentChangelog];
  writeFileSync(CHANGELOG_JSON_PATH, JSON.stringify(updated, null, 2) + "\n", "utf8");

  console.log(`[changelog] Entri baru "${newEntry.version}" ditulis ke public/changelog.json:`);
  newEntry.changes.forEach((c) => console.log(`  - ${c.id}`));

  // Beritahu step berikutnya di workflow bahwa ada perubahan untuk di-commit.
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    writeFileSync(githubOutput, "changed=true\n", { flag: "a" });
  }
}

main().catch((err) => {
  console.error("[changelog] Error tak terduga:", err);
  // Tetap exit 0: fitur changelog otomatis ini best-effort/opsional,
  // jangan sampai menggagalkan seluruh CI/deploy gara-gara ini.
  process.exit(0);
});
