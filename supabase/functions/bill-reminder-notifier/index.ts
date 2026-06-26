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
//      admin, dan belum pernah dikirim untuk siklus jatuh tempo + hari-ke
//      yang sama (dedup).
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
}

interface CategoryRow {
  key: string;
  label_id: string | null;
  label_en: string | null;
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// FIX #markdown-entity-bug: row.name (nama bill) adalah TEXT bebas dari
// input user (lihat bill_reminders.name di migration 20260708000000, tidak
// ada validasi karakter), dan catLabel (label kategori) admin-editable.
// Keduanya disisipkan mentah ke dalam template string yang dikirim dengan
// parse_mode: "Markdown" (legacy Markdown Telegram, BUKAN MarkdownV2).
// Kalau nilainya mengandung salah satu dari _ * ` [ tanpa pasangan yang
// valid (mis. nama bill "Cicilan_Motor" atau "Token PLN [token]"), Telegram
// gagal parse entity dan sendMessage ditolak dengan error 400 "can't parse
// entities" -- inilah akar masalah dari log error yang dilaporkan.
// Solusi: escape ke-4 karakter spesial Markdown legacy itu dengan backslash
// SEBELUM disisipkan ke template, supaya selalu dianggap teks literal oleh
// Telegram, bukan dicoba diparse sebagai entity formatting.
function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[])/g, "\\$1");
}

// Teks bot Telegram untuk reminder tagihan. Mengikuti pola botText.ts
// (pasangan id/en di satu tempat) -- HARUS tetap sinkron secara konsep
// dengan api/_lib/botText.ts kalau ada teks serupa ditambahkan di sana,
// tapi disimpan terpisah di sini karena Edge Function (Deno) tidak bisa
// import file dari api/_lib/*.ts (lingkungan Node/Vercel).
//
// FIX #bill-tx: tombol "Tandai Lunas" sekarang juga membuat transaksi
// expense (lihat set_bill_paid_status, migration 20260710000000), yang
// MEWAJIBKAN amount terisi. Kalau amount NULL, beri tahu di pesan reminder
// itu sendiri (bukan baru ketahuan setelah tombol ditekan & ditolak).
function reminderText(lang: "id" | "en", row: DueBillRow, catLabel: string): string {
  const safeName = escapeMarkdown(row.name);
  const safeCatLabel = escapeMarkdown(catLabel);

  const dueLabel =
    row.days_until_due === 0
      ? (lang === "id" ? "*HARI INI*" : "*TODAY*")
      : (lang === "id" ? `*${row.days_until_due} hari lagi*` : `*in ${row.days_until_due} day(s)*`);

  const amountLine = row.amount != null
    ? (lang === "id" ? `💰 Estimasi: *${formatIDR(row.amount)}*\n` : `💰 Estimated: *${formatIDR(row.amount)}*\n`)
    : "";

  const ctaLine = row.amount != null
    ? (lang === "id" ? `\nSudah dibayar? Tandai lunas langsung di sini 👇` : `\nAlready paid? Mark it as paid right here 👇`)
    : (lang === "id"
        ? `\n⚠️ _Nominal belum diisi -- isi dulu di halaman Pengingat Tagihan sebelum bisa ditandai lunas dari sini._`
        : `\n⚠️ _Amount not set yet -- fill it in on the Bill Reminders page before you can mark this as paid from here._`);

  if (lang === "id") {
    return (
      `🔔 *Pengingat Tagihan*\n\n` +
      `📌 ${safeName} (${safeCatLabel})\n` +
      `📅 Jatuh tempo: ${dueLabel} (${row.next_due_date})\n` +
      amountLine +
      ctaLine
    );
  }
  return (
    `🔔 *Bill Reminder*\n\n` +
    `📌 ${safeName} (${safeCatLabel})\n` +
    `📅 Due: ${dueLabel} (${row.next_due_date})\n` +
    amountLine +
    ctaLine
  );
}

function markPaidButtonLabel(lang: "id" | "en"): string {
  return lang === "id" ? "✅ Tandai Lunas" : "✅ Mark as Paid";
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

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

    return new Response(JSON.stringify({ success: true, sent, skipped, total: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("bill-reminder-notifier error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
