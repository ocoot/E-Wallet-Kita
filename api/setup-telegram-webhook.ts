import { VercelRequest, VercelResponse } from '@vercel/node';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
    return;
  }

  try {
    const setupTokenFromQuery = req.query.token as string;
    const setupTokenFromHeader = req.headers['x-setup-token'] as string;
    const setupToken = setupTokenFromQuery || setupTokenFromHeader;
    
    const validToken = process.env.TELEGRAM_SETUP_TOKEN;

    if (!validToken) {
      res.status(500).json({ 
        error: "TELEGRAM_SETUP_TOKEN not configured in environment variables" 
      });
      return;
    }

    if (!setupToken || setupToken !== validToken) {
      res.status(403).json({ 
        error: "Unauthorized. Invalid or missing setup token." 
      });
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const appUrl = process.env.APP_URL;
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!token) {
      res.status(400).json({ 
        error: "Missing TELEGRAM_BOT_TOKEN in environment variables" 
      });
      return;
    }

    if (!appUrl) {
      res.status(400).json({ 
        error: "Missing APP_URL in environment variables" 
      });
      return;
    }

    const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram-webhook`;

    console.log("🔄 Setting up Telegram webhook...");
    console.log(`  Bot Token: ${token.substring(0, 10)}...`);
    console.log(`  Webhook URL: ${webhookUrl}`);
    console.log(`  Secret Token: ${secretToken ? 'SET' : 'NOT SET'}`);

    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken || undefined,
        allowed_updates: ["message", "callback_query"]
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Telegram API error:", result);
      res.status(400).json({ 
        success: false, 
        error: "Telegram API returned an error",
        details: result
      });
      return;
    }

    console.log("✅ Telegram webhook registered successfully!");

    if (result.ok && result.result === true) {
      res.status(200).json({ 
        success: true, 
        message: "✅ Webhook registered successfully to Telegram API",
        webhook_url: webhookUrl,
        telegram_response: result,
        next_steps: [
          "Test the bot by sending /start to your bot in Telegram",
          "Try the /link command with a valid code",
          "Check server logs for webhook updates"
        ]
      });
    } else {
      res.status(200).json({ 
        success: false, 
        message: "Telegram API returned an unexpected response",
        webhook_url: webhookUrl,
        telegram_response: result
      });
    }

  } catch (err: any) {
    console.error("🔴 Setup Telegram Webhook error:", err);
    res.status(500).json({ 
      error: "Internal server error",
      message: err.message 
    });
  }
};
