import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 1. Auth check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];
  
  // Use client with user's token
  const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });

  const { data: { user }, error: authError } = await userSupabase.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid token or unauthorized session' });
    return;
  }

  // Check role of user
  const { data: profile, error: profileError } = await userSupabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !["admin", "owner"].includes(profile.role)) {
    res.status(403).json({ error: 'Forbidden: Only admins or owners can broadcast' });
    return;
  }

  // Parse message
  const { message } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length < 5) {
    res.status(400).json({ error: 'Pesan broadcast minimal 5 karakter' });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN tidak dikonfigurasi' });
    return;
  }

  // Fetch target list through rpc
  const { data: targets, error: rpcError } = await userSupabase.rpc("admin_get_telegram_chat_ids");
  if (rpcError) {
    res.status(500).json({ error: rpcError.message });
    return;
  }

  const broadcastText = `📢 *Pesan dari Admin E-Wallet Kita*\n\n${message.trim()}\n\n_— Tim E-Wallet Kita_`;

  let successCount = 0;
  let failCount = 0;

  for (const target of (targets || [])) {
    try {
      const telRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: Number(target.chat_id),
          text: broadcastText,
          parse_mode: "Markdown"
        })
      });
      const telJson: any = await telRes.json();
      if (telJson.ok) {
        successCount++;
      } else {
        console.error(`Telegram sendMessage failed for chat ${target.chat_id}:`, telJson);
        failCount++;
      }
    } catch (err) {
      console.error(`Telegram fetch error for chat ${target.chat_id}:`, err);
      failCount++;
    }
    // Rate limit prevention
    await new Promise(r => setTimeout(r, 50));
  }

  res.status(200).json({
    success: true,
    total: targets?.length ?? 0,
    successCount,
    failCount
  });
}
