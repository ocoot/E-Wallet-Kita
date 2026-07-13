import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = Deno.env.get("SUPPORT_TELEGRAM_BOT_TOKEN") ?? "";

    const body = await req.json();

    // 1. Handle message from our React applet (user sends a message)
    if (body.mode === "user_message") {
      const { session_id, content } = body;

      // Insert message into public.support_messages table as 'user'
      const { data: msgData, error: msgError } = await supabase
        .from("support_messages")
        .insert({
          session_id,
          sender: "user",
          content,
        })
        .select()
        .single();

      if (msgError) throw msgError;

      // Get session's short_code + telegram_thread_id + siapa pemiliknya
      const { data: sessData, error: sessError } = await supabase
        .from("support_sessions")
        .select("short_code, user_id, telegram_thread_id")
        .eq("id", session_id)
        .single();

      if (sessError) throw sessError;

      let userLabel = "";
      if (sessData.user_id) {
        const { data: userData } = await supabase
          .from("users")
          .select("display_name")
          .eq("id", sessData.user_id)
          .maybeSingle();
        if (userData?.display_name) userLabel = userData.display_name;
      }

      // Get admin chat ID from app_settings (sekarang harus ID supergroup
      // yang Forum Topics-nya sudah aktif)
      const { data: adminSetting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "support_admin_chat_id")
        .maybeSingle();

      if (adminSetting?.value && token) {
        let threadId: number | null = sessData.telegram_thread_id ?? null;

        // Sesi ini belum punya topic Telegram-nya -- buat sekali di pesan
        // pertama (lazy create, bukan saat sesi dibuat, supaya sesi yang
        // dibuat lalu tidak jadi dipakai tidak meninggalkan topic kosong).
        if (!threadId) {
          try {
            const topicName = `${userLabel || "User"} • #${sessData.short_code}`.slice(0, 128);
            const topicRes = await fetch(`https://api.telegram.org/bot${token}/createForumTopic`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: adminSetting.value, name: topicName }),
            });
            const topicJson = await topicRes.json();

            if (topicJson.ok && topicJson.result?.message_thread_id) {
              threadId = topicJson.result.message_thread_id;
              await supabase
                .from("support_sessions")
                .update({ telegram_thread_id: threadId })
                .eq("id", session_id);
            } else {
              // Gagal bikin topic (mis. grup belum benar-benar supergroup /
              // topics belum aktif / bot bukan admin) -- catat, lalu tetap
              // lanjut kirim ke chat utama sebagai fallback di bawah.
              try {
                await supabase.from("error_logs").insert({
                  source: "support-bridge",
                  level: "warning",
                  message: "Gagal membuat Telegram Forum Topic, fallback ke chat utama.",
                  context: { session_id, short_code: sessData.short_code, telegram_response: topicJson },
                });
              } catch (logErr) {
                console.error("[support-bridge] Gagal mencatat error_logs (soft-fail):", logErr);
              }
            }
          } catch (topicErr) {
            console.error("[support-bridge] createForumTopic error:", topicErr);
          }
        }

        // Kalau ada topic (baru dibuat atau sudah ada sebelumnya), pesan
        // di dalam topic itu tidak perlu lagi header kode sesi -- nama
        // topic-nya sendiri sudah menandakan ini sesi siapa. Kalau topic
        // gagal dibuat, tetap sertakan header supaya admin masih bisa
        // reply manual seperti alur lama.
        const messageText = threadId
          ? `${userLabel ? `👤 *${userLabel}*\n` : ""}💬 ${content}`
          : `🔔 *Pesan Baru${userLabel ? ` dari ${userLabel}` : ""}*\nSesi #${sessData.short_code}\n💬 ${content}`;

        const sendPayload: Record<string, unknown> = {
          chat_id: adminSetting.value,
          text: messageText,
          parse_mode: "Markdown",
        };
        if (threadId) sendPayload.message_thread_id = threadId;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sendPayload),
        });
      } else {
        // Admin belum /register chat-nya, atau bot token belum di-set --
        // pesan user sudah tersimpan di DB tapi TIDAK ADA yang akan
        // memberitahu admin. Sebelumnya ini gagal diam-diam; sekarang
        // dicatat supaya kelihatan di Admin Panel > Error Monitor.
        try {
          await supabase.from("error_logs").insert({
            source: "support-bridge",
            level: "warning",
            message: "Notifikasi admin tidak terkirim: support_admin_chat_id atau SUPPORT_TELEGRAM_BOT_TOKEN belum dikonfigurasi.",
            context: { session_id, short_code: sessData.short_code },
          });
        } catch (logErr) {
          console.error("[support-bridge] Gagal mencatat error_logs (soft-fail):", logErr);
        }
      }

      return new Response(JSON.stringify({ success: true, data: msgData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. Handle incoming updates from the Telegram Support Bot webhook (admin replies or commands)
    if (body.message) {
      const message = body.message;
      const chatId = message.chat.id;
      const text = message.text ? message.text.trim() : "";
      const threadId: number | undefined = message.message_thread_id;

      // Commands: /register to link this Telegram (super)group as the Admin Support channel
      if (text.startsWith("/register")) {
        const { error: upsertError } = await supabase
          .from("app_settings")
          .upsert({
            key: "support_admin_chat_id",
            value: String(chatId),
            updated_at: new Date().toISOString(),
          });

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
      // ke telegram_thread_id di database. TIDAK ADA lagi regex/reply-to
      // yang rawan salah sasaran kalau admin lupa reply ke pesan yang benar.
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

        // Topic ada tapi sesinya sudah tidak aktif (ditutup/dibersihkan) --
        // beri tahu di topic yang sama, jangan diam-diam gagal.
        await sendTelegram(token, chatId, `⚠️ Sesi untuk topic ini sudah ditutup atau tidak ditemukan.`, threadId);
        return new Response("ok", { status: 200 });
      }

      // Fallback untuk pesan di luar topic (mis. General topic, atau kalau
      // Forum Topics belum sempat kepakai untuk sesi tertentu) -- pakai
      // cara lama: admin reply ke pesan yang berisi kode sesi.
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
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (supabaseUrl && supabaseServiceKey) {
        const supabaseLog = createClient(supabaseUrl, supabaseServiceKey);
        await supabaseLog.from("error_logs").insert({
          source: "support-bridge",
          level: "error",
          message: err?.message ? String(err.message) : "Unhandled error di support-bridge",
        });
      }
    } catch (logErr) {
      console.error("[support-bridge] Gagal mencatat error_logs (soft-fail):", logErr);
    }
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function sendTelegram(token: string, chatId: number, text: string, messageThreadId?: number) {
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
