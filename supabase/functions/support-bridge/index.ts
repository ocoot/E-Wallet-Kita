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

      if (!session_id || typeof content !== "string" || !content.trim()) {
        return jsonResponse({ error: "session_id dan content wajib diisi." }, 400);
      }

      const caller = await getAuthorizedCaller(req, supabaseUrl);
      if (!caller) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { data: ownerCheck, error: ownerError } = await supabase
        .from("support_sessions")
        .select("id, user_id, status")
        .eq("id", session_id)
        .maybeSingle();
      if (ownerError) throw ownerError;
      if (!ownerCheck || ownerCheck.user_id !== caller.id) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      if (!["open", "claimed"].includes(ownerCheck.status)) {
        return jsonResponse({ error: "Sesi sudah ditutup." }, 400);
      }

      const { data: rlRows, error: rlError } = await supabase.rpc(
        "check_and_increment_support_message_rate_limit",
        { p_session_id: session_id, p_limit: 10, p_window_seconds: 60 }
      );
      if (rlError) {
        console.error("[support-bridge] rate limit check failed, failing open:", rlError);
      } else {
        const rl = rlRows?.[0];
        if (rl && !rl.allowed) {
          return jsonResponse({ error: "Terlalu banyak pesan, coba lagi sebentar lagi.", retryAfter: rl.retry_after_seconds }, 429);
        }
      }

      const isImageMessage = isImageUrl(content);
      const { data: msgData, error: msgError } = await supabase
        .from("support_messages")
        .insert({ session_id, sender: "user", content, image_url: isImageMessage ? content.trim() : null })
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

        if (isImageUrl(content)) {
          const caption = threadId
            ? `${userLabel ? `${userLabel}` : ""}`
            : `*Pesan Baru${userLabel ? ` dari ${userLabel}` : ""}*\nSesi #${sessData.short_code}`;
          await sendTelegramPhoto(token, adminChatId, content.trim(), caption || undefined, threadId ?? undefined);
        } else {
          const messageText = threadId
            ? `${userLabel ? `*${userLabel}*\n` : ""} ${content}`
            : `*Pesan Baru${userLabel ? ` dari ${userLabel}` : ""}*\nSesi #${sessData.short_code}\n ${content}`;
          await sendTelegram(token, adminChatId, messageText, threadId ?? undefined);
        }
      } else {
        await logWarning(supabase, "Notifikasi admin tidak terkirim: support_admin_chat_id atau SUPPORT_TELEGRAM_BOT_TOKEN belum dikonfigurasi.", { session_id, short_code: sessData.short_code });
      }

      return jsonResponse({ success: true, data: msgData });
    }

    // 2. Mirror balasan admin dari web dashboard (AdminSupportChat.tsx) ke
    //    topic Telegram sesi yang bersangkutan.
    if (body.mode === "admin_web_reply") {
      const { session_id, content } = body;

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

        if (isImageUrl(content)) {
          await sendTelegramPhoto(token, adminChatId, content.trim(), "*Admin (Web)*", threadId ?? undefined);
        } else {
          const messageText = `*Admin (Web)*\n${content}`;
          await sendTelegram(token, adminChatId, messageText, threadId ?? undefined);
        }
      } else {
        await logWarning(supabase, "Balasan admin dari web tidak ter-mirror ke Telegram: support_admin_chat_id atau SUPPORT_TELEGRAM_BOT_TOKEN belum dikonfigurasi.", { session_id, short_code: sessData.short_code });
      }

      return jsonResponse({ success: true });
    }

    // 3. Handle incoming updates from the Telegram Support Bot webhook (admin replies or commands)
    if (body.message) {
      const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
      const expectedSecret = Deno.env.get("SUPPORT_TELEGRAM_WEBHOOK_SECRET") ?? "";

      if (!expectedSecret) {
        console.error("SUPPORT_TELEGRAM_WEBHOOK_SECRET is not configured — rejecting all Telegram webhook updates.");
        return jsonResponse({ error: "Webhook is not configured correctly" }, 500);
      }
      if (secretHeader !== expectedSecret) {
        console.warn("Unauthorized support-bridge webhook request blocked");
        return jsonResponse({ error: "Unauthorized update request" }, 403);
      }

      const message = body.message;
      const chatId = message.chat.id;
      const text = message.text ? message.text.trim() : "";
      const caption = message.caption ? message.caption.trim() : "";
      const threadId: number | undefined = message.message_thread_id;
      const photo = message.photo;

      const effectiveText = text || caption;

      // Commands: /register to link this Telegram (super)group as the Admin Support channel
      if (effectiveText.startsWith("/register")) {
        const { error: upsertError } = await supabase
          .from("app_settings")
          .upsert({ key: "support_admin_chat_id", value: String(chatId), updated_at: new Date().toISOString() });

        if (upsertError) {
          await sendTelegram(token, chatId, `Gagal mendaftarkan chat: ${upsertError.message}`, threadId);
        } else {
          await sendTelegram(token, chatId, `*Sukses!*\nChat ini telah didaftarkan sebagai Admin Support Chat.`, threadId);
        }
        return new Response("ok", { status: 200 });
      }

      if (!effectiveText && !photo) {
        return new Response("ok", { status: 200 });
      }

      // Helper: insert admin message (text + optional image) into DB
      const insertAdminMessage = async (sessionId: string, imageUrl?: string) => {
        const payload: Record<string, unknown> = { session_id: sessionId, sender: "admin", content: caption || text || "" };
        if (imageUrl) payload.image_url = imageUrl;
        const { error: insertError } = await supabase.from("support_messages").insert(payload);
        if (insertError) {
          await sendTelegram(token, chatId, `Gagal menyimpan pesan: ${insertError.message}`, threadId);
          return false;
        }
        return true;
      };

      // Helper: upload Telegram photo to Supabase Storage
      const uploadPhoto = async (fileId: string): Promise<string | null> => {
        try {
          const buffer = await downloadTelegramFile(token, fileId);
          const ext = "jpg";
          const path = `telegram/${Date.now()}_${fileId.slice(0, 8)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("chat-attachments")
            .upload(path, buffer, { contentType: "image/jpeg", upsert: false });
          if (upErr) throw upErr;
          const { data: publicUrlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
          return `${publicUrlData.publicUrl}?v=${Date.now()}`;
        } catch (err: any) {
          console.error("[support-bridge] Gagal upload foto Telegram:", err);
          await logWarning(supabase, "Gagal upload foto Telegram ke chat-attachments (soft-fail, pesan lanjut tanpa gambar).", {
            file_id: fileId,
            error: err?.message ? String(err.message) : String(err),
          });
          return null;
        }
      };

      // Live Chat Reply via Forum Topics
      if (threadId) {
        const { data: session, error: sessError } = await supabase
          .from("support_sessions")
          .select("id, status")
          .eq("telegram_thread_id", threadId)
          .in("status", ["open", "claimed"])
          .maybeSingle();

        if (sessError) {
          await sendTelegram(token, chatId, `Database error: ${sessError.message}`, threadId);
          return new Response("ok", { status: 200 });
        }

        if (session) {
          let imageUrl: string | undefined;
          if (photo && photo.length > 0) {
            const largest = photo.reduce((a, b) => (a.file_size > b.file_size ? a : b));
            imageUrl = await uploadPhoto(largest.file_id) || undefined;
          }

          const ok = await insertAdminMessage(session.id, imageUrl);
          if (!ok) return new Response("ok", { status: 200 });

          if (session.status === "open") {
            await supabase.from("support_sessions").update({ status: "claimed" }).eq("id", session.id);
          }
          return new Response("ok", { status: 200 });
        }

        await sendTelegram(token, chatId, `Sesi untuk topic ini sudah ditutup atau tidak ditemukan.`, threadId);
        return new Response("ok", { status: 200 });
      }

      // Fallback via reply_to_message
      if (message.reply_to_message) {
        const repliedText = message.reply_to_message.text || message.reply_to_message.caption || "";
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
            await sendTelegram(token, chatId, `Database error: ${sessError.message}`);
            return new Response("ok", { status: 200 });
          }

          if (!session) {
            await sendTelegram(token, chatId, `Sesi dengan kode #${shortCode} tidak ditemukan atau sudah ditutup.`);
            return new Response("ok", { status: 200 });
          }

          let imageUrl: string | undefined;
          if (photo && photo.length > 0) {
            const largest = photo.reduce((a, b) => (a.file_size > b.file_size ? a : b));
            imageUrl = await uploadPhoto(largest.file_id) || undefined;
          }

          const ok = await insertAdminMessage(session.id, imageUrl);
          if (!ok) return new Response("ok", { status: 200 });

          if (session.status === "open") {
            await supabase.from("support_sessions").update({ status: "claimed" }).eq("id", session.id);
          }
        } else {
          await sendTelegram(token, chatId, `Mohon balas (reply) ke pesan berisi kode sesi (contoh: #A1B2C3).`);
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

function isImageUrl(text: string): boolean {
  return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|heic|heif)(\?.*)?$/i.test(text.trim());
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

async function sendTelegramPhoto(token: string, chatId: string | number, photoUrl: string, caption?: string, messageThreadId?: number) {
  if (!token) return;
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    photo: photoUrl,
  };
  if (caption) payload.caption = caption;
  if (messageThreadId) payload.message_thread_id = messageThreadId;
  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function downloadTelegramFile(token: string, fileId: string): Promise<ArrayBuffer> {
  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const fileJson = await fileRes.json();
  if (!fileJson.ok) throw new Error("Gagal mendapatkan file path dari Telegram");
  const filePath: string = fileJson.result.file_path;
  const res = await fetch(`https://api.telegram.org/bot${token}/${filePath}`);
  if (!res.ok) {
    throw new Error(`Gagal download file dari Telegram (status ${res.status}): kemungkinan file_path sudah expired atau tidak valid.`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Respons file dari Telegram bukan gambar (content-type: ${contentType || "tidak diketahui"}).`);
  }
  return res.arrayBuffer();
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

async function getAuthorizedCaller(req: Request, supabaseUrl: string): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;

  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await authClient.auth.getUser(jwt);
  if (userErr || !userRes?.user) return null;

  return { id: userRes.user.id };
}

async function getAuthorizedAdmin(req: Request, supabaseUrl: string): Promise<{ id: string } | null> {
  const caller = await getAuthorizedCaller(req, supabaseUrl);
  if (!caller) return null;

  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const { data: profile } = await adminClient.from("users").select("role").eq("id", caller.id).maybeSingle();

  if (!profile || !["admin", "owner"].includes(profile.role)) return null;

  return caller;
}
