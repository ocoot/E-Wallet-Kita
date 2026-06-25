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

      // Get session's short_code
      const { data: sessData, error: sessError } = await supabase
        .from("support_sessions")
        .select("short_code")
        .eq("id", session_id)
        .single();

      if (sessError) throw sessError;

      // Get admin chat ID from app_settings
      const { data: adminSetting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "support_admin_chat_id")
        .maybeSingle();

      if (adminSetting?.value && token) {
        // Format the message with the unique session identifier code so the admin can reply easily
        const messageText = `🔔 *Pesan Baru dari Sesi #${sessData.short_code}*\n` +
          `💬 ${content}`;
          
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: adminSetting.value,
            text: messageText,
            parse_mode: "Markdown",
          }),
        });
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

      // Commands: /register to link this Telegram chat as the Admin Support channel
      if (text.startsWith("/register")) {
        const { error: upsertError } = await supabase
          .from("app_settings")
          .upsert({
            key: "support_admin_chat_id",
            value: String(chatId),
            updated_at: new Date().toISOString(),
          });

        if (upsertError) {
          await sendTelegram(token, chatId, `❌ Gagal mendaftarkan chat: ${upsertError.message}`);
        } else {
          await sendTelegram(token, chatId, `✅ *Sukses!*\nChat ini telah didaftarkan sebagai Admin Support Chat.`);
        }
        return new Response("ok", { status: 200 });
      }

      // Live Chat Reply: admin replies to a forwarded message
      if (message.reply_to_message && text) {
        const repliedText = message.reply_to_message.text || "";
        console.log("REPLIED TEXT:", repliedText);
        const match = repliedText.match(/#([A-Z0-9]+)/);
        console.log("MATCH RESULT:", match);

        if (match) {
          const shortCode = match[1];

          // Fetch active support session
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

          // Insert message as 'admin'
          const { error: insertError } = await supabase
            .from("support_messages")
            .insert({
              session_id: session.id,
              sender: "admin",
              content: text,
            });

          if (insertError) {
            await sendTelegram(token, chatId, `❌ Gagal menyimpan pesan: ${insertError.message}`);
            return new Response("ok", { status: 200 });
          }

          // If the session status is still open, automatically set it to claimed since the admin replied
          if (session.status === "open") {
            await supabase
              .from("support_sessions")
              .update({ status: "claimed" })
              .eq("id", session.id);
          }
        } else {
          await sendTelegram(token, chatId, `⚠️ Mohon balas (reply) ke pesan berisi kode sesi (contoh: #A1B2C3).`);
        }
      }
    }

    return new Response("ok", { status: 200 });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function sendTelegram(token: string, chatId: number, text: string) {
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}
