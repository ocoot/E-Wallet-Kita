import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SessionForTopic {
  id: string;
  short_code: string;
  user_id: string | null;
  telegram_thread_id: number | null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const token = Deno.env.get("SUPPORT_TELEGRAM_BOT_TOKEN") ?? "";

  try {
    const body = await req.json();

    // 1. Handle message from our React applet (user sends a message)
    if (body.mode === "user_message") {
      const { session_id, content } = body;

      const { data: msgData, error: msgError } = await supabase
        .from("support_messages")
        .insert({ session_id, sender: "user", content })
        .select()
        .single();
      if (msgError) throw msgError;

      const { data: sessData, error: sessError } = await supabase
        .from("support_sessions")
        .select("id, short_code, user_id, telegram_thread_id")
        .eq("id", session_id)
        .single();
      if (sessError) throw sessError;

      const userLabel = await getUserLabel(supabase, sessData.user_id);
      const adminChatId = await getAdminChatId(supabase);

      if (adminChatId && token) {
        const threadId = await ensureForumTopic(supabase, token, adminChatId, sessData as SessionForTopic, userLabel);

        const messageText = threadId
          ? `${userLabel ? `👤 *${userLabel}*\n` : ""}💬 ${content}`
          : `🔔 *Pesan Baru${userLabel ? ` dari ${userLabel}` : ""}*\nSesi #${sessData.short_code}\n💬 ${content}`;

        await sendTelegram(token, adminChatId, messageText, threadId ?? undefined);
      } else {
        await logWarning(supabase, "Notifikasi admin tidak terkirim: support_admin_chat_id atau SUPPORT_TELEGRAM_BOT_TOKEN belum dikonfigurasi.", { session_id, short_code: sessData.short_code });
      }

      return jsonResponse({ success: true, data: msgData });
    }

    // 2. Mirror balasan admin dari web dashboard (AdminSupportChat.tsx) ke
    //    topic Telegram sesi yang bersangkutan, supaya riwayat di kedua
    //    sisi (web & Telegram) selalu sinkron, apapun channel yang dipakai
    //    admin. Pesan ke `support_messages` SUDAH diinsert lewat RPC
    //    `admin_reply_support_session` sebelum edge function ini dipanggil
    //    -- tugas di sini murni mengirim salinannya ke Telegram.
    if (body.mode === "admin_web_reply") {
      const { session_id, content } = body;

      // Edge function pakai service_role (bypass RLS), jadi identitas &
      // role admin/owner HARUS diverifikasi manual di sini -- kalau tidak,
      // siapa saja yang tahu endpoint ini bisa mengirim pesan mengatasnamakan
      // admin ke topic Telegram manapun.
      const caller = await getAuthorizedAdmin(req, supabaseUrl);
      if (!caller) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { data: sessData, error: sessError } = await supabase
        .from("support_sessions")
        .select("id, short_code, user_id, telegram_thread_id, status")
        .eq("id", session_id)
        .single();
      if (sessError) throw sessError;

      if (!["open", "claimed"].includes(sessData.status)) {
        return jsonResponse({ error: "Sesi sudah ditutup." }, 400);
      }

      const userLabel = await getUserLabel(supabase, sessData.user_id);
      const adminChatId = await getAdminChatId(supabase);

      if (adminChatId && token) {
        const threadId = await ensureForumTopic(supabase, token, adminChatId, sessData as SessionForTopic, userLabel);
        const messageText = `🖥️ *Admin (Web)*\n${content}`;
        await sendTelegram(token, adminChatId, messageText, threadId ?? undefined);
      } else {
        await logWarning(supabase, "Balasan admin dari web tidak ter-mirror ke Telegram: support_admin_chat_id atau SUPPORT_TELEGRAM_BOT_TOKEN belum dikonfigurasi.", { session_id, short_code: sessData.short_code });
      }

      return jsonResponse({ success: true });
    }

    // 3. Handle incoming updates from the Telegram Support Bot webhook (admin replies or commands)
    if (body.message) {
      // Validasi ini WAJIB sebelum memproses apapun dari body.message --
      // tanpa ini, siapapun yang tahu URL function ini bisa mengirim
      // "update Telegram" palsu (mis. menyamar jadi admin membalas sesi
      // orang lain). Header ini HANYA dikirim oleh Telegram sendiri kalau
      // secret_token di-set lewat setWebhook (lihat
      // scripts/setup-support-telegram-webhook.ts). Mode lain
      // (`user_message`, `admin_web_reply`) berasal dari frontend kita
      // sendiri via supabase.functions.invoke, bukan dari Telegram, jadi
      // TIDAK divalidasi dengan header ini.
      const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
      const expectedSecret = Deno.env.get("SUPPORT_TELEGRAM_WEBHOOK_SECRET") ?? "";

      if (!expectedSecret) {
        console.error("🔴 SUPPORT_TELEGRAM_WEBHOOK_SECRET is not configured — rejecting all Telegram webhook updates.");
        return jsonResponse({ error: "Webhook is not configured correctly" }, 500);
      }
      if (secretHeader !== expectedSecret) {
        console.warn("⚠️ Unauthorized support-bridge webhook request blocked");
        return jsonResponse({ error: "Unauthorized update request" }, 403);
      }

      const message = body.message;
      const chatId = message.chat.id;
      const text = message.text ? message.text.trim() : "";
      const threadId: number | undefined = message.message_thread_id;

      // Commands: /register to link this Telegram (super)group as the Admin Support channel
      if (text.startsWith("/register")) {
        const { error: upsertError } = await supabase
          .from("app_settings")
          .upsert({ key: "support_admin_chat_id", value: String(chatId), updated_at: new Date().toISOString() });

        if (upsertError) {
          await sendTelegram(token, chatId, `❌ Gagal mendaftarkan chat: ${upsertError.message}`, threadId);
        } else {
          await sendTelegram(token, chatId, `✅ *Sukses!*\nChat ini telah didaftarkan sebagai Admin Support Chat.`, threadId);
        }
        return new Response("ok", { status: 200 });
      }

      if (!text) {
        return new Response("ok", { status: 200 });
      }

      // Live Chat Reply -- jalur utama (Forum Topics): setiap sesi punya
      // topic sendiri, jadi cukup cocokkan message_thread_id dari Telegram
      // ke telegram_thread_id di database.
      if (threadId) {
        const { data: session, error: sessError } = await supabase
          .from("support_sessions")
          .select("id, status")
          .eq("telegram_thread_id", threadId)
          .in("status", ["open", "claimed"])
          .maybeSingle();

        if (sessError) {
          await sendTelegram(token, chatId, `❌ Database error: ${sessError.message}`, threadId);
          return new Response("ok", { status: 200 });
        }

        if (session) {
          const { error: insertError } = await supabase
            .from("support_messages")
            .insert({ session_id: session.id, sender: "admin", content: text });

          if (insertError) {
            await sendTelegram(token, chatId, `❌ Gagal menyimpan pesan: ${insertError.message}`, threadId);
            return new Response("ok", { status: 200 });
          }

          if (session.status === "open") {
            await supabase.from("support_sessions").update({ status: "claimed" }).eq("id", session.id);
          }
          return new Response("ok", { status: 200 });
        }

        await sendTelegram(token, chatId, `⚠️ Sesi untuk topic ini sudah ditutup atau tidak ditemukan.`, threadId);
        return new Response("ok", { status: 200 });
      }

      // Fallback untuk pesan di luar topic manapun (mis. General topic) --
      // pakai cara lama: admin reply ke pesan yang berisi kode sesi.
      if (message.reply_to_message) {
        const repliedText = message.reply_to_message.text || "";
        const match = repliedText.match(/#([A-Z0-9]+)/);

        if (match) {
          const shortCode = match[1];

          const { data: session, error: sessError } = await supabase
            .from("support_sessions")
            .select("id, status")
            .eq("short_code", shortCode)
            .in("status", ["open", "claimed"])
            .maybeSingle();

          if (sessError) {
            await sendTelegram(token, chatId, `❌ Database error: ${sessError.message}`);
            return new Response("ok", { status: 200 });
          }

          if (!session) {
            await sendTelegram(token, chatId, `⚠️ Sesi dengan kode #${shortCode} tidak ditemukan atau sudah ditutup.`);
            return new Response("ok", { status: 200 });
          }

          const { error: insertError } = await supabase
            .from("support_messages")
            .insert({ session_id: session.id, sender: "admin", content: text });

          if (insertError) {
            await sendTelegram(token, chatId, `❌ Gagal menyimpan pesan: ${insertError.message}`);
            return new Response("ok", { status: 200 });
          }

          if (session.status === "open") {
            await supabase.from("support_sessions").update({ status: "claimed" }).eq("id", session.id);
          }
        } else {
          await sendTelegram(token, chatId, `⚠️ Mohon balas (reply) ke pesan berisi kode sesi (contoh: #A1B2C3).`);
        }
      }
    }

    return new Response("ok", { status: 200 });

  } catch (err: any) {
    console.error("support-bridge error:", err);
    try {
      const supabaseLog = createClient(supabaseUrl, supabaseServiceKey);
      await supabaseLog.from("error_logs").insert({
        source: "support-bridge",
        level: "error",
        message: err?.message ? String(err.message) : "Unhandled error di support-bridge",
      });
    } catch (logErr) {
      console.error("[support-bridge] Gagal mencatat error_logs (soft-fail):", logErr);
    }
    return jsonResponse({ error: err.message }, 400);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function getUserLabel(supabase: any, userId: string | null): Promise<string> {
  if (!userId) return "";
  const { data } = await supabase.from("users").select("display_name").eq("id", userId).maybeSingle();
  return data?.display_name || "";
}

async function getAdminChatId(supabase: any): Promise<string | null> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "support_admin_chat_id").maybeSingle();
  return data?.value ?? null;
}

async function logWarning(supabase: any, message: string, context: Record<string, unknown>) {
  try {
    await supabase.from("error_logs").insert({ source: "support-bridge", level: "warning", message, context });
  } catch (logErr) {
    console.error("[support-bridge] Gagal mencatat error_logs (soft-fail):", logErr);
  }
}

/**
 * Pastikan sesi punya Telegram Forum Topic. Kalau belum ada, buat sekarang
 * (lazy create) dan simpan `telegram_thread_id`-nya. Dipakai baik dari
 * pesan pertama user maupun balasan pertama admin dari web (jaga-jaga
 * kalau admin sempat balas dari web sebelum user kirim pesan apapun).
 */
async function ensureForumTopic(
  supabase: any,
  token: string,
  adminChatId: string,
  session: SessionForTopic,
  userLabel: string
): Promise<number | null> {
  if (session.telegram_thread_id) return session.telegram_thread_id;

  try {
    const topicName = `${userLabel || "User"} • #${session.short_code}`.slice(0, 128);
    const topicRes = await fetch(`https://api.telegram.org/bot${token}/createForumTopic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: adminChatId, name: topicName }),
    });
    const topicJson = await topicRes.json();

    if (topicJson.ok && topicJson.result?.message_thread_id) {
      const threadId = topicJson.result.message_thread_id;
      await supabase.from("support_sessions").update({ telegram_thread_id: threadId }).eq("id", session.id);
      return threadId;
    }

    await logWarning(supabase, "Gagal membuat Telegram Forum Topic, fallback ke chat utama.", {
      session_id: session.id,
      short_code: session.short_code,
      telegram_response: topicJson,
    });
  } catch (topicErr) {
    console.error("[support-bridge] createForumTopic error:", topicErr);
  }

  return null;
}

/**
 * Verifikasi caller (dari Authorization header yang dikirim
 * supabase.functions.invoke) benar-benar user login DAN rolenya admin/owner.
 * WAJIB dipanggil sebelum mengizinkan mode yang bertindak atas nama admin
 * (`admin_web_reply`), karena edge function ini pakai service_role client
 * yang bypass RLS -- tanpa cek ini, siapapun yang punya URL function bisa
 * kirim pesan mengatasnamakan admin.
 */
async function getAuthorizedAdmin(req: Request, supabaseUrl: string): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;

  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await authClient.auth.getUser(jwt);
  if (userErr || !userRes?.user) return null;

  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const { data: profile } = await adminClient.from("users").select("role").eq("id", userRes.user.id).maybeSingle();

  if (!profile || !["admin", "owner"].includes(profile.role)) return null;

  return { id: userRes.user.id };
}

async function sendTelegram(token: string, chatId: string | number, text: string, messageThreadId?: number) {
  if (!token) return;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };
  if (messageThreadId) payload.message_thread_id = messageThreadId;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
