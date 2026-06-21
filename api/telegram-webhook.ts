import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

// Parse Indonesian amounts (k, rb, jt, etc)
function parseAmountFromString(text: string): number {
  const cleaned = text.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
  const regex = /([\d.]+)\s*(jt|juta|rb|ribu|k)?/i;
  const match = cleaned.match(regex);
  if (!match) return 0;
  
  const numValue = parseFloat(match[1]);
  const suffix = match[2];
  
  if (!suffix) return isNaN(numValue) ? 0 : numValue;
  
  if (suffix === 'jt' || suffix === 'juta') {
    return Math.round(numValue * 1000000);
  }
  if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') {
    return Math.round(numValue * 1000);
  }
  return isNaN(numValue) ? 0 : numValue;
}

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabaseBackend = createClient(supabaseUrl, supabaseAnonKey);

// Initialize Gemini
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Category labels
const botCategoryLabels: Record<string, { id: string; en: string }> = {
  salary: { id: "Gaji", en: "Salary" },
  bonus: { id: "Bonus", en: "Bonus" },
  food_drink: { id: "Makanan & Minuman", en: "Food & Drink" },
  monthly_groceries: { id: "Belanja Bulanan", en: "Monthly Groceries" },
  vegetables: { id: "Belanja Sayur", en: "Vegetables" },
  bills: { id: "Tagihan", en: "Bills" },
  other: { id: "Lain-lain", en: "Other" }
};

function inferCategoryKey(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("makan") || t.includes("minum") || t.includes("beli bakso") || t.includes("kopi") || t.includes("warung") || t.includes("restoran")) {
    return "food_drink";
  }
  if (t.includes("gaji") || t.includes("gajian") || t.includes("salary") || t.includes("upah") || t.includes("transfer masuk")) {
    return "salary";
  }
  if (t.includes("bonus") || t.includes("hadiah") || t.includes("thr") || t.includes("sampingan")) {
    return "bonus";
  }
  if (t.includes("belanja bulanan") || t.includes("supermarket") || t.includes("alfamart") || t.includes("indomaret") || t.includes("groceries")) {
    return "monthly_groceries";
  }
  if (t.includes("sayur") || t.includes("pasar") || t.includes("bumbu") || t.includes("belanja sayur")) {
    return "vegetables";
  }
  if (t.includes("listrik") || t.includes("air") || t.includes("pdam") || t.includes("pulsa") || t.includes("tagihan") || t.includes("wifi") || t.includes("internet") || t.includes("token")) {
    return "bills";
  }
  return "other";
}

async function parseFinancialQuery(query: string): Promise<{
  source: string;
  type: "income" | "expense";
  category_key: string;
  amount: number;
  original_text: string;
}> {
  if (!ai) {
    const inferredAmount = parseAmountFromString(query);
    const inferredCategory = inferCategoryKey(query);
    const inferredType = ["gaji", "bonus", "salary", "upah"].some(k => query.toLowerCase().includes(k)) ? "income" : "expense";
    return {
      source: "fallback_server_regex",
      type: inferredType,
      category_key: inferredCategory,
      amount: inferredAmount,
      original_text: query
    };
  }

  const systemInstruction = `You are a financial parsing expert for 'E-Wallet Kita'. 
Analyze natural language transactions in Indonesian or English and output structured JSON.
Mapping keys for categories are exactly:
- 'salary' (income)
- 'bonus' (income)
- 'food_drink' (expense)
- 'monthly_groceries' (expense)
- 'vegetables' (expense)
- 'bills' (expense)
- 'other' (expense or fallback if unsure)

Translate Indonesian abbreviations for quantities:
- 'rb' or 'ribu' means thousands (e.g. '25rb' -> amount should be 25000)
- 'k' means thousands (e.g. '1k' -> amount should be 1000)
- 'jt' or 'juta' means millions (e.g. '1.5jt' -> amount should be 1500000)
Return the numerical value in 'amount' property.
If categories do not match any, default category_key to 'other'.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: `Parse this input text: "${query}"`,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["income", "expense"], description: "Type of transaction" },
          category_key: { type: Type.STRING, description: "Category string key" },
          amount: { type: Type.NUMBER, description: "Numeric Indonesian Rupiah conversion" },
          original_text: { type: Type.STRING, description: "The raw input string parsed" }
        },
        required: ["type", "category_key", "amount", "original_text"]
      }
    }
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error("Empty response from Gemini API");
  }

  const parsedJSON = JSON.parse(responseText.trim());
  const codeParsedAmount = parseAmountFromString(query);
  
  if (codeParsedAmount > 0 && (!parsedJSON.amount || parsedJSON.amount <= 10)) {
    parsedJSON.amount = codeParsedAmount;
  }

  return {
    source: "gemini-3.5-flash",
    type: parsedJSON.type || "expense",
    category_key: parsedJSON.category_key || inferCategoryKey(query),
    amount: parsedJSON.amount || codeParsedAmount || 0,
    original_text: query
  };
}

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: replyMarkup
      })
    });
    
    if (!response.ok) {
      console.error(`❌ sendTelegramMessage failed: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.error(`❌ sendTelegramMessage to ${chatId} failed:`, err);
  }
}

async function editTelegramMessage(chatId: number, messageId: number, text: string, replyMarkup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "Markdown",
        reply_markup: replyMarkup
      })
    });
  } catch (err) {
    console.error(`❌ editTelegramMessage for ${chatId}/${messageId} failed:`, err);
  }
}

async function answerTelegramCallback(callbackQueryId: string, text?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text
      })
    });
  } catch (err) {
    console.error(`❌ answerTelegramCallback ${callbackQueryId} failed:`, err);
  }
}

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    
    if (secretToken && secretHeader !== secretToken) {
      console.warn("⚠️ Unauthorized Telegram Webhook request blocked (Secret Token mismatch)");
      res.status(403).json({ error: "Unauthorized update request" });
      return;
    }

    const update = req.body;
    console.log("📨 Telegram update received:", JSON.stringify(update, null, 2));

    // Handle Inline Button Callback Queries
    if (update.callback_query) {
      const queryId = update.callback_query.id;
      const chatId = update.callback_query.message?.chat?.id;
      const msgId = update.callback_query.message?.message_id;
      const actionData = update.callback_query.data;

      if (!chatId || !msgId) {
        res.status(200).json({ ok: true });
        return;
      }

      const { data: pendingRows, error: pendingErr } = await supabaseBackend.rpc("get_pending_telegram_tx", {
        p_chat_id: chatId
      });

      if (pendingErr) {
        console.error("❌ RPC get_pending_telegram_tx error:", pendingErr);
      }

      const pending = pendingRows && pendingRows.length > 0 ? pendingRows[0] : null;

      if (actionData === "tx_confirm") {
        if (!pending) {
          await answerTelegramCallback(queryId, "Transaksi tidak ditemukan atau sudah kadaluwarsa.");
          await editTelegramMessage(chatId, msgId, "❌ *Sesi Konfirmasi Kedaluwarsa*\n_Silakan tulis ulang transaksi keuangan Anda di bawah ini._");
          res.status(200).json({ ok: true });
          return;
        }

        const { error } = await supabaseBackend.rpc("insert_telegram_transaction", {
          p_chat_id: chatId,
          p_type: pending.type,
          p_category: pending.category_key,
          p_amount: pending.amount,
          p_note: pending.original_text,
          p_date: new Date().toISOString().split("T")[0]
        });

        if (error) {
          console.error("❌ RPC insert_telegram_transaction error:", error);
          await answerTelegramCallback(queryId, "Gagal menyimpan transaksi.");
          await editTelegramMessage(chatId, msgId, `❌ *Gagal Menyimpan Transaksi*\n_Koneksi database bermasalah: ${error.message}_`);
        } else {
          await supabaseBackend.rpc("delete_pending_telegram_tx", { p_chat_id: chatId });
          await answerTelegramCallback(queryId, "Transaksi berhasil dicatat!");
          
          const catLabel = botCategoryLabels[pending.category_key]?.id || pending.category_key;
          const amountStr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(pending.amount);

          await editTelegramMessage(
            chatId,
            msgId,
            `✅ *Transaksi Berhasil Disimpan!*\n\n` +
            `• *Tipe*: ${pending.type === "income" ? "📥 Pemasukan" : "📤 Pengeluaran"}\n` +
            `• *Kategori*: ${catLabel}\n` +
            `• *Jumlah*: *${amountStr}*\n` +
            `• *Catatan*: "${pending.original_text}"\n\n` +
            `_Catatan telah tersimpan secara aman ke E-Wallet Kita._ 🌸`
          );
        }
      } 
      else if (actionData === "tx_cancel") {
        await supabaseBackend.rpc("delete_pending_telegram_tx", { p_chat_id: chatId });
        await answerTelegramCallback(queryId, "Pencatatan dibatalkan.");
        await editTelegramMessage(chatId, msgId, "❌ *Pencatatan transaksi telah dibatalkan.*");
      }

      res.status(200).json({ ok: true });
      return;
    }

    // Handle Standard incoming messages
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      // COMMANDS CHECK
      if (text.startsWith("/")) {
        const parts = text.split(" ");
        const command = parts[0].toLowerCase();

        if (command === "/start") {
          await sendTelegramMessage(
            chatId,
            `Halo! Selamat datang di *E-Wallet Kita Bot* 🌸\n\n` +
            `Saya adalah asisten pintar untuk mencatat keuangan Anda secepat mengirim chat!\n\n` +
            `Untuk mulai mencatat, silakan *tautkan akun* Anda terlebih dahulu:\n` +
            `1️⃣ Buka website *E-Wallet Kita*\n` +
            `2️⃣ Masuk ke halaman *Pengaturan (Settings)*\n` +
            `3️⃣ Cari bagian *Koneksi Bot Telegram* dan tekan *Buat Kode Tautan*\n` +
            `4️⃣ Kirim perintah tautan berikut di sini:\n` +
            `     \`/link <kode_5_digit>\` (Contoh: \`/link 12345\`)\n\n` +
            `💡 Ketik \`/help\` untuk informasi bantuan commands.`
          );
          res.status(200).json({ ok: true });
          return;
        }

        if (command === "/help") {
          await sendTelegramMessage(
            chatId,
            `💡 *Panduan Asisten E-Wallet Kita Bot*:\n\n` +
            `1️⃣ *Koneksi Akun*:\n` +
            `     Ketik \`/link <kode_5_digit>\`\n` +
            `     Contoh: \`/link 58204\`\n\n` +
            `2️⃣ *Mencatat Keuangan* (Setelah Terhubung):\n` +
            `     Cukup tulis pesan chat apa saja tentang transaksi Anda!\n` +
            `     Contoh:\n` +
            `     • \`Makan siang bersama bu siska 45rb\`\n` +
            `     • \`Gaji sampingan jualan kue 1.2jt\`\n` +
            `     • \`Belanja sayur bayam 12k\`\n` +
            `     • \`Bayar tagihan listrik rumah 250rb\`\n\n` +
            `3️⃣ *Daftar Perintah (Commands)*:\n` +
            `     • \`/saldo\` - Melihat status ringkasan saldo bulan ini.\n` +
            `     • \`/unlink\` - Memutuskan koneksi akun Telegram dari sistem.\n` +
            `     • \`/help\` - Membuka pesan bantuan petunjuk ini.`
          );
          res.status(200).json({ ok: true });
          return;
        }

        // ✅ /link COMMAND - THIS IS THE KEY COMMAND
        if (command === "/link") {
          const code = parts[1];
          if (!code || code.length !== 5) {
            await sendTelegramMessage(chatId, "⚠️ Format perintah salah. Silakan kirim dalam format: `/link <kode_5_digit>` - Contoh: `/link 12345`.");
            res.status(200).json({ ok: true });
            return;
          }

          console.log(`🔗 /link command received: code=${code}, chatId=${chatId}`);

          const { data, error } = await supabaseBackend.rpc("link_telegram_user", {
            p_code: code,
            p_chat_id: chatId
          });

          console.log("RPC response - data:", data, "error:", error);

          if (error) {
            console.error("❌ RPC link_telegram_user error:", error);
            await sendTelegramMessage(chatId, `⚠️ Terjadi error internal saat menautkan akun: ${error.message}`);
          } else if (data && data.length > 0 && data[0]?.success) {
            const displayName = data[0]?.display_name || "Pengguna";
            await sendTelegramMessage(
              chatId,
              `🎉 *Tautan Akun Berhasil Terhubung!* ✅\n\n` +
              `Halo, *${displayName}*! Chat ini sekarang aman terhubung dengan aplikasi *E-Wallet Kita*.\n\n` +
              `Sekarang Anda sudah bisa langsung melakukan pencatatan keuangan otomatis. Silakan tulis transaksi pertama Anda!`
            );
          } else {
            const errMsg = data && data.length > 0 && data[0]?.message ? data[0].message : "Kode tautan tidak valid atau telah kedaluwarsa.";
            await sendTelegramMessage(chatId, `❌ *Gagal Tertaut*\n\n${errMsg}`);
          }

          res.status(200).json({ ok: true });
          return;
        }

        if (command === "/unlink") {
          const { error } = await supabaseBackend.rpc("unlink_telegram_user", {
            p_chat_id: chatId
          });

          if (error) {
            await sendTelegramMessage(chatId, `❌ Gagal memutuskan tautan: ${error.message}`);
          } else {
            await sendTelegramMessage(chatId, "👋 *Koneksi bot Telegram dibatalkan.* Hubungan chat ini dengan E-Wallet Kita berhasil diputuskan.");
          }
          res.status(200).json({ ok: true });
          return;
        }

        if (command === "/saldo") {
          const { data, error } = await supabaseBackend.rpc("get_telegram_user_summary", {
            p_chat_id: chatId
          });

          if (error) {
            console.error("❌ RPC get_telegram_user_summary error:", error);
            await sendTelegramMessage(chatId, "⚠️ Terjadi kesalahan internal saat memuat data saldo.");
          } else if (!data || data.length === 0 || !data[0]?.display_name) {
            await sendTelegramMessage(chatId, "⚠️ *Akun belum terhubung.* Silakan hubungkan Telegram Anda terlebih dahulu menggunakan perintah `/link <kode>`.");
          } else {
            const summary = data[0];
            const incStr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(summary.total_income);
            const expStr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(summary.total_expense);
            const balStr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(summary.net_balance);

            await sendTelegramMessage(
              chatId,
              `📊 *Ringkasan Keuangan Bulan Ini* 🌸\n\n` +
              `Halo, *${summary.display_name}*! Berikut adalah laporan keuangan Anda bulan ini:\n\n` +
              `• *Total Pemasukan*: 📥 \`${incStr}\`\n` +
              `• *Total Pengeluaran*: 📤 \`${expStr}\`\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `• *Saldo Tabungan*: 💰 *${balStr}*\n\n` +
              `_Gunakan bot ini untuk terus merekam transaksi harian secara praktis!_`
            );
          }
          res.status(200).json({ ok: true });
          return;
        }

        // Fallback for unhandled command
        await sendTelegramMessage(chatId, "⚠️ Perintah tidak dikenali. Silakan ketik `/help` untuk bantuan.");
        res.status(200).json({ ok: true });
        return;
      }

      // TRANSACTION PARSING FROM NATURAL CHAT TEXT
      const { data: userProfile, error: profileErr } = await supabaseBackend.rpc("get_user_by_telegram_chat_id", {
        p_chat_id: chatId
      });

      if (profileErr) {
        console.error("Profile lookup error:", profileErr);
        await sendTelegramMessage(chatId, "⚠️ Terjadi kegagalan pencarian profil akun.");
        res.status(200).json({ ok: true });
        return;
      }

      if (!userProfile || userProfile.length === 0) {
        await sendTelegramMessage(
          chatId,
          `⚠️ *Akun Belum Terhubung*\n\n` +
          `Maaf, kami tidak bisa mencatat transaksi Anda karena chat ini belum terhubung ke akun mana pun.\n\n` +
          `Silakan ketik \`/link <kode_5_digit>\` untuk menautkan akun.`
        );
        res.status(200).json({ ok: true });
        return;
      }

      await sendTelegramMessage(chatId, "🔄 _Sedang menganalisis catatan keuangan Anda..._");
      
      try {
        const parsed = await parseFinancialQuery(text);
        
        if (parsed.amount <= 0) {
          await sendTelegramMessage(
            chatId,
            `⚠️ *Gagal Membaca Nominal*\n\n` +
            `Kami memahami transaksi Anda bermaksud mencatat sesuatu, namun nominal angka uang tidak berhasil terdeteksi.\n` +
            `Contoh input benar:\n` +
            `- "Makan nasi goreng *40rb*"\n` +
            `- "Beli galon aqua *Rp 20.000*"\n\n` +
            `Silakan ulangi kembali!`
          );
          res.status(200).json({ ok: true });
          return;
        }

        const { error: upsertErr } = await supabaseBackend.rpc("upsert_pending_telegram_tx", {
          p_chat_id: chatId,
          p_type: parsed.type,
          p_category_key: parsed.category_key,
          p_amount: parsed.amount,
          p_original_text: parsed.original_text
        });

        if (upsertErr) {
          console.error("❌ RPC upsert_pending_telegram_tx error:", upsertErr);
          await sendTelegramMessage(chatId, "⚠️ Terjadi kesalahan internal saat menyimpan draf transaksi. Silakan coba lagi.");
          res.status(200).json({ ok: true });
          return;
        }

        const localizedCat = botCategoryLabels[parsed.category_key]?.id || parsed.category_key;
        const currencyStr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(parsed.amount);

        const promptReplyMarkup = {
          inline_keyboard: [
            [
              { text: "✅ Benar, Simpan", callback_data: "tx_confirm" },
              { text: "❌ Batalkan", callback_data: "tx_cancel" }
            ]
          ]
        };

        await sendTelegramMessage(
          chatId,
          `📝 *Draf Catatan Transaksi*\n` +
          `Apakah rincian keuangan berikut sudah sesuai?\n\n` +
          `• *Tipe*: ${parsed.type === "income" ? "📥 Pemasukan" : "📤 Pengeluaran"}\n` +
          `• *Kategori*: ${localizedCat}\n` +
          `• *Nominal*: *${currencyStr}*\n` +
          `• *Catatan*: "${parsed.original_text}"`,
          promptReplyMarkup
        );

      } catch (parseError: any) {
        console.error("Parse Error:", parseError);
        await sendTelegramMessage(chatId, "⚠️ Maaf, asisten parsing kami mengalami kendala teknis sementara. Mohon coba ulangi beberapa saat lagi.");
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("🔴 Telegram Webhook Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
