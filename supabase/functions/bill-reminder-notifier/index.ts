// Edge Function: bill-reminder-notifier
//
// Dipanggil oleh pg_cron job `bill-reminder-notify-hourly` (lihat migration
// 20260709000000_bill_reminder_notifications.sql) tiap jam, lewat pg_net
// http_post. pg_cron HANYA scheduler -- semua logic (query siapa yang harus
// diingatkan sekarang, format pesan, kirim ke Telegram, catat log) ada di
// sini, bukan di SQL.
//
// Alur:
//   1. Panggil RPC get_due_bill_reminders_for_notification() (service-role).
//      RPC itu sendiri yang sudah menyaring: belum lunas, jam lokal user
//      persis 19:00, window H-3..H+0, fitur bill_reminders tidak dikunci
//      admin, toggle "telegram_bill_reminder" user tidak dimatikan (lihat
//      migration 20260820000000_notification_preferences.sql), dan belum
//      pernah dikirim untuk siklus jatuh tempo + hari-ke yang sama (dedup).
//      RPC juga mengembalikan push_bill_reminder_enabled per baris, dipakai
//      di langkah 3b untuk memutuskan channel FCM sekunder.
//   2. Untuk setiap baris, ambil label kategori dari tabel `categories`
//      (sama seperti getCategoryLabel() di api/telegram-webhook.ts:
//      label_id/label_en dengan fallback ke category_key).
//   3. Format & kirim pesan Telegram dengan tombol inline "Tandai Lunas"
//      (callback_data: `bill_paid:<bill_id>`, ditangani oleh
//      api/telegram-webhook.ts seperti pola rcpt_approve:<id> yang sudah ada).
//   4. Kalau sendMessage sukses, panggil log_bill_reminder_sent() supaya
//      tidak dikirim dobel untuk siklus & hari-ke yang sama.
//
// Catatan: pakai TELEGRAM_BOT_TOKEN yang SAMA dengan bot utama (bukan
// SUPPORT_TELEGRAM_BOT_TOKEN milik supabase/functions/support-bridge),
// karena reminder ini bagian dari bot utama E-Wallet Kita. Harus di-set
// sebagai Edge Function secret terpisah (lihat ringkasan setup di akhir).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DueBillRow {
  bill_id: string;
  user_id: string;
  chat_id: number | null;
  lang: "id" | "en";
  name: string;
  category_key: string;
  amount: number | null;
  next_due_date: string; // YYYY-MM-DD
  days_until_due: number; // 0..3
  push_bill_reminder_enabled: boolean;
}

interface CategoryRow {
  key: string;
  label_id: string | null;
  label_en: string | null;
}

// Escape karakter spesial Telegram legacy Markdown (_ * ` [ ) supaya nilai
// dinamis dari user (nama tagihan, label kategori) tidak pernah dianggap
// sebagai pembuka entity Markdown yang tidak ditutup.
//
// Root cause bug "Can't find end of the entity starting at byte offset 45":
// row.name (nama tagihan, bebas teks dari user, mis. "Cicilan_Motor" atau
// "Internet * WiFi") disisipkan mentah-mentah ke dalam teks yang dikirim
// dengan parse_mode: "Markdown". Telegram membaca `_` / `*` / `` ` `` / `[`
// sebagai pembuka entity (italic/bold/code/link); kalau di nama itu jumlah
// karakter tsb ganjil (entity tidak pernah ditutup), Telegram API menolak
// SELURUH pesan dengan 400 Bad Request, dan reminder gagal terkirim total.
function escapeMarkdown(text: string): string {
  return text.replace(/[_*`\[]/g, (ch) => `\\${ch}`);
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Teks bot Telegram untuk reminder tagihan. Mengikuti pola botText.ts
// (pasangan id/en di satu tempat) -- HARUS tetap sinkron secara konsep
// dengan api/_lib/botText.ts kalau ada teks serupa ditambahkan di sana,
// tapi disimpan terpisah di sini karena Edge Function (Deno) tidak bisa
// import file dari api/_lib/*.ts (lingkungan Node/Vercel).
function reminderText(lang: "id" | "en", row: DueBillRow, catLabel: string): string {
  const dueLabel =
    row.days_until_due === 0
      ? (lang === "id" ? "*HARI INI*" : "*TODAY*")
      : (lang === "id" ? `*${row.days_until_due} hari lagi*` : `*in ${row.days_until_due} day(s)*`);

  const amountLine = row.amount != null
    ? (lang === "id" ? `Estimasi: *${formatIDR(row.amount)}*\n` : `Estimated: *${formatIDR(row.amount)}*\n`)
    : "";

  // row.name & catLabel adalah teks bebas (nama tagihan custom dari user,
  // label kategori) -- WAJIB di-escape sebelum disisipkan ke teks Markdown.
  const safeName = escapeMarkdown(row.name);
  const safeCatLabel = escapeMarkdown(catLabel);

  if (lang === "id") {
    return (
      `*Pengingat Tagihan*\n\n` +
      `${safeName} (${safeCatLabel})\n` +
      `Jatuh tempo: ${dueLabel} (${row.next_due_date})\n` +
      amountLine +
      `\nSudah dibayar? Tandai lunas langsung di sini`
    );
  }
  return (
    `*Bill Reminder*\n\n` +
    `${safeName} (${safeCatLabel})\n` +
    `Due: ${dueLabel} (${row.next_due_date})\n` +
    amountLine +
    `\nAlready paid? Mark it as paid right here`
  );
}

function markPaidButtonLabel(lang: "id" | "en"): string {
  return lang === "id" ? "Tandai Lunas" : "Mark as Paid";
}

async function sendTelegramReminder(
  token: string,
  chatId: number,
  text: string,
  billId: string,
  lang: "id" | "en"
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: markPaidButtonLabel(lang), callback_data: `bill_paid:${billId}` },
          ]],
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Telegram sendMessage failed for chat ${chatId}: ${response.status} ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Telegram sendMessage exception for chat ${chatId}:`, err);
    return false;
  }
}

async function sendFcmReminder(
  vercelAppUrl: string,
  internalSecret: string,
  userId: string,
  title: string,
  body: string,
  billId: string
): Promise<void> {
  // Best-effort secondary channel — a failure here must never affect the
  // Telegram send result or the dedup log, so all errors are swallowed.
  //
  // NOTE: we deliberately do NOT call Firebase's HTTP API directly from
  // here. The old fcm.googleapis.com/fcm/send "legacy" endpoint that took
  // a simple server key was shut down by Google in June 2024; the current
  // HTTP v1 endpoint requires an OAuth2 access token signed with the
  // Firebase service account's private key, which would mean hand-rolling
  // JWT signing in Deno. That logic already exists (and is tested) in the
  // firebase-admin SDK on the Node/Vercel side — see api/_lib/fcm.ts — so
  // we just call into that via an internal, secret-protected endpoint.
  try {
    const response = await fetch(`${vercelAppUrl}/api/internal/send-bill-reminder-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({
        user_id: userId,
        title,
        body,
        data: { bill_id: billId },
      }),
    });
    if (!response.ok) {
      // Non-2xx is NOT a JS exception, so without this check a failure here
      // (401 secret mismatch, 500 Firebase credential error, etc.) would be
      // completely silent -- this bit us in production: the Firebase service
      // account key was revoked and the push channel failed with zero
      // visibility in this function's logs until a user reported it.
      const responseBody = await response.text();
      console.error(
        `[FCM] reminder push endpoint returned ${response.status} for bill ${billId}: ${responseBody}`
      );
    }
  } catch (err) {
    console.error(`[FCM] reminder channel error for bill ${billId}:`, err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    // Optional: FCM secondary channel. If either is missing, we simply
    // skip the FCM push and still send the Telegram reminder as before —
    // this is an additive feature, not a hard requirement.
    const vercelAppUrl = Deno.env.get("VERCEL_APP_URL") ?? "";
    const internalApiSecret = Deno.env.get("INTERNAL_API_SECRET") ?? "";
    const fcmChannelEnabled = !!vercelAppUrl && !!internalApiSecret;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured for this Edge Function");
    }
    if (!telegramToken) {
      throw new Error("TELEGRAM_BOT_TOKEN not configured for this Edge Function");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Ambil semua bill yang harus diingatkan sekarang.
    const { data: dueRows, error: dueError } = await supabase.rpc(
      "get_due_bill_reminders_for_notification"
    );

    if (dueError) {
      throw new Error(`get_due_bill_reminders_for_notification failed: ${dueError.message}`);
    }

    const rows = (dueRows || []) as DueBillRow[];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. Ambil label kategori sekali untuk semua key yang relevan
    //    (sama prinsip dengan getActiveCategories() di api/_lib/categories.ts,
    //    tapi versi ringan khusus key yang dipakai di batch ini).
    const categoryKeys = Array.from(new Set(rows.map((r) => r.category_key)));
    const { data: categories } = await supabase
      .from("categories")
      .select("key, label_id, label_en")
      .in("key", categoryKeys);

    const categoryMap = new Map<string, CategoryRow>(
      ((categories || []) as CategoryRow[]).map((c) => [c.key, c])
    );

    let sent = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.chat_id) {
        // Tidak seharusnya terjadi (RPC sudah filter telegram_chat_id IS NOT NULL),
        // tapi tetap dijaga agar tidak crash seluruh batch kalau ada data aneh.
        skipped++;
        continue;
      }

      const cat = categoryMap.get(row.category_key);
      const catLabel = row.lang === "id"
        ? (cat?.label_id || row.category_key)
        : (cat?.label_en || row.category_key);

      const text = reminderText(row.lang, row, catLabel);
      const ok = await sendTelegramReminder(telegramToken, row.chat_id, text, row.bill_id, row.lang);

      if (ok) {
        sent++;

        // FCM secondary channel — fire-and-forget, never blocks dedup
        // logging or affects the Telegram-based `sent`/`skipped` counts.
        // Also respects the user's "push_bill_reminder" toggle (Settings),
        // already resolved per-row by get_due_bill_reminders_for_notification
        // (fail-open to true if the user has no preferences row yet).
        if (fcmChannelEnabled && row.push_bill_reminder_enabled) {
          const pushTitle = row.lang === "id" ? "Pengingat Tagihan" : "Bill Reminder";
          const pushBody = row.lang === "id"
            ? `${row.name} jatuh tempo ${row.days_until_due === 0 ? "hari ini" : `${row.days_until_due} hari lagi`}`
            : `${row.name} due ${row.days_until_due === 0 ? "today" : `in ${row.days_until_due} day(s)`}`;
          sendFcmReminder(vercelAppUrl, internalApiSecret, row.user_id, pushTitle, pushBody, row.bill_id);
        }
        // 3. Catat sudah terkirim -- HANYA kalau sendMessage sukses, supaya
        //    kegagalan kirim (mis. user blokir bot) tidak ikut ter-dedup
        //    dan masih dicoba lagi di jam berikutnya selama masih H-3..H+0.
        const { error: logError } = await supabase.rpc("log_bill_reminder_sent", {
          p_bill_id: row.bill_id,
          p_user_id: row.user_id,
          p_due_date: row.next_due_date,
          p_days_until_due: row.days_until_due,
        });
        if (logError) {
          console.error(`log_bill_reminder_sent failed for bill ${row.bill_id}:`, logError.message);
        }
      } else {
        skipped++;
      }
    }

    if (skipped > 0) {
      try {
        await supabase.from("error_logs").insert({
          source: "bill-reminder-notifier",
          level: sent === 0 ? "error" : "warning",
          message: `${skipped}/${rows.length} pengingat tagihan gagal dikirim (chat_id kosong atau sendMessage gagal, mis. user blokir bot).`,
          context: { sent, skipped, total: rows.length },
        });
      } catch (logErr) {
        console.error("[bill-reminder-notifier] Gagal mencatat error_logs (soft-fail):", logErr);
      }
    }

    return new Response(JSON.stringify({ success: true, sent, skipped, total: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("bill-reminder-notifier error:", err);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (supabaseUrl && supabaseServiceKey) {
        const supabaseLog = createClient(supabaseUrl, supabaseServiceKey);
        await supabaseLog.from("error_logs").insert({
          source: "bill-reminder-notifier",
          level: "error",
          message: err?.message ? String(err.message) : "Unhandled error di bill-reminder-notifier",
        });
      }
    } catch (logErr) {
      console.error("[bill-reminder-notifier] Gagal mencatat error_logs di catch terluar (soft-fail):", logErr);
    }
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});