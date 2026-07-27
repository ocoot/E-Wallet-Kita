// Edge Function: birthday-reminder-notifier
//
// Dipanggil oleh pg_cron job `birthday-reminder-notify-hourly` (lihat
// migration 20260830000000_birthday_reminders.sql) tiap jam, lewat pg_net
// http_post. Sama seperti bill-reminder-notifier: pg_cron HANYA scheduler,
// semua logic (query siapa yang harus diingatkan, format pesan, kirim ke
// Telegram, catat log) ada di sini.
//
// Alur:
//   1. Panggil RPC get_due_birthday_reminders_for_notification() (service
//      role). RPC sudah menyaring: birth_date terisi, telegram terhubung,
//      jam lokal user persis 19:00, PERSIS H-1 dari tanggal ulang tahun
//      yang dirayakan tahun ini (sudah termasuk pergeseran 29 Feb -> 1 Mar
//      lewat get_observed_birthday(), lihat migration), fitur 'calendar'
//      tidak dikunci admin, dan belum pernah dikirim untuk
//      (user_id, observed_date) yang sama.
//   2. Format & kirim pesan Telegram ucapan H-1.
//   3. Kalau sendMessage sukses, panggil log_birthday_reminder_sent()
//      supaya tidak dikirim dobel untuk ulang tahun tahun yang sama.
//
// Catatan: pakai TELEGRAM_BOT_TOKEN yang SAMA dengan bot utama (env var
// yang sama dengan yang dipakai bill-reminder-notifier).
//
// Ini jalur TERPISAH dari banner in-app (lihat getBirthdayReminderKind()
// di src/lib/birthday.ts, dipakai MainLayout di App.tsx) -- banner in-app
// tidak butuh Telegram maupun Edge Function ini sama sekali, jadi user
// yang belum menghubungkan Telegram tetap kebagian pengingat lewat banner
// saat membuka aplikasi.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DueBirthdayRow {
  user_id: string;
  chat_id: number | null;
  lang: "id" | "en";
  display_name: string | null;
  observed_date: string; // YYYY-MM-DD
}

// Sama seperti bill-reminder-notifier: escape karakter spesial Telegram
// legacy Markdown supaya display_name bebas-teks dari user tidak pernah
// dianggap sebagai entity Markdown yang tidak ditutup.
function escapeMarkdown(text: string): string {
  return text.replace(/[_*`\[]/g, (ch) => `\\${ch}`);
}

function reminderText(lang: "id" | "en", row: DueBirthdayRow): string {
  const name = row.display_name ? escapeMarkdown(row.display_name) : "";
  if (lang === "id") {
    return (
      `*Ulang Tahun Besok!*\n\n` +
      (name ? `Halo ${name}, ` : `Halo, `) +
      `besok (${row.observed_date}) adalah hari ulang tahun Anda. 🎉\n\n` +
      `Semoga tahun barunya penuh berkah dan rezeki lancar!`
    );
  }
  return (
    `*Your Birthday is Tomorrow!*\n\n` +
    (name ? `Hi ${name}, ` : `Hi, `) +
    `tomorrow (${row.observed_date}) is your birthday. 🎉\n\n` +
    `Wishing you a wonderful year ahead!`
  );
}

async function sendTelegramReminder(
  token: string,
  chatId: number,
  text: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
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

    const { data: dueRows, error: dueError } = await supabase.rpc(
      "get_due_birthday_reminders_for_notification"
    );

    if (dueError) {
      throw new Error(`get_due_birthday_reminders_for_notification failed: ${dueError.message}`);
    }

    const rows = (dueRows || []) as DueBirthdayRow[];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let sent = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.chat_id) {
        // Tidak seharusnya terjadi (RPC sudah filter telegram_chat_id IS NOT NULL).
        skipped++;
        continue;
      }

      const text = reminderText(row.lang, row);
      const ok = await sendTelegramReminder(telegramToken, row.chat_id, text);

      if (ok) {
        sent++;
        const { error: logError } = await supabase.rpc("log_birthday_reminder_sent", {
          p_user_id: row.user_id,
          p_observed_date: row.observed_date,
        });
        if (logError) {
          console.error(`log_birthday_reminder_sent failed for user ${row.user_id}:`, logError.message);
        }
      } else {
        skipped++;
      }
    }

    if (skipped > 0) {
      try {
        await supabase.from("error_logs").insert({
          source: "birthday-reminder-notifier",
          level: sent === 0 ? "error" : "warning",
          message: `${skipped}/${rows.length} pengingat ulang tahun gagal dikirim (chat_id kosong atau sendMessage gagal, mis. user blokir bot).`,
          context: { sent, skipped, total: rows.length },
        });
      } catch (logErr) {
        console.error("[birthday-reminder-notifier] Gagal mencatat error_logs (soft-fail):", logErr);
      }
    }

    return new Response(JSON.stringify({ success: true, sent, skipped, total: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("birthday-reminder-notifier error:", err);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (supabaseUrl && supabaseServiceKey) {
        const supabaseLog = createClient(supabaseUrl, supabaseServiceKey);
        await supabaseLog.from("error_logs").insert({
          source: "birthday-reminder-notifier",
          level: "error",
          message: err?.message ? String(err.message) : "Unhandled error di birthday-reminder-notifier",
        });
      }
    } catch (logErr) {
      console.error("[birthday-reminder-notifier] Gagal mencatat error_logs di catch terluar (soft-fail):", logErr);
    }
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
