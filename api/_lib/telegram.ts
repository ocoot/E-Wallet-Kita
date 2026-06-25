// Retry wrapper for Telegram API calls (up to 2 retries)
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 500): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

export async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await withRetry(async () => {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", reply_markup: replyMarkup })
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram API ${response.status}: ${body}`);
      }
    });
  } catch (err) {
    console.error(`❌ sendTelegramMessage to ${chatId} failed after retries:`, err);
  }
}

export async function sendTelegramMessageOrThrow(chatId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  await withRetry(async () => {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", reply_markup: replyMarkup })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API ${response.status}: ${body}`);
    }
  });
}

export async function editTelegramMessage(chatId: number, messageId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await withRetry(async () => {
      const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "Markdown", reply_markup: replyMarkup })
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram API ${response.status}: ${body}`);
      }
    });
  } catch (err) {
    console.error(`❌ editTelegramMessage for ${chatId}/${messageId} failed after retries:`, err);
  }
}

export async function answerTelegramCallback(callbackQueryId: string, text?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await withRetry(async () => {
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text })
      });
    });
  } catch (err) {
    console.error(`❌ answerTelegramCallback ${callbackQueryId} failed after retries:`, err);
  }
}
