import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { parseReceipt } from './_lib/receipt-parser.js';
import { getMaintenanceStatus, isFeatureLocked } from './_lib/maintenance.js';
import { logError } from './_lib/errorLogger.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Receipt OCR calls a paid AI/vision API per request — keep this modest.
// DB-backed (see check_and_increment_receipt_rate_limit RPC) so it holds
// across cold starts / multiple serverless instances.
const RECEIPT_RATE_LIMIT = 5;               // requests per window, per user
const RECEIPT_RATE_LIMIT_WINDOW = 60000;    // 1 minute

/**
 * POST /api/receipt  { action: "parse", imageBase64, source? }
 *   → OCR struk (dulu: api/parse-receipt.ts). Premium-only.
 * POST /api/receipt  { action: "send", email, orderId, pdfBase64, ... }
 *   → kirim struk pembelian premium via email (dulu: api/send-receipt.ts)
 *
 * Digabung supaya tidak menambah jumlah serverless function di Vercel
 * Hobby plan (limit 12 function/project). Keduanya sama-sama butuh
 * Bearer auth, jadi auth check dilakukan sekali di awal handler().
 */

// Fix loop v0.77.0 (I-2): tanggal struk dari AI bisa berupa string sampah
// yang truthy tapi tak-terurai — `new Date(...).toISOString()` melempar
// RangeError sebelum draf + penanda R2 (`receipt_date_suspect`) tersimpan.
// Tanggal tak-terurai → null (bukan throw); validator di receipt-parser
// sudah menandai kasus itu di `raw_ai_response`. Idiom sama seperti
// validateParsedReceipt: `new Date()` sendiri tidak pernah throw, hanya
// `.toISOString()` yang throw untuk Invalid Date.
function toIsoDateOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function handleParse(req: VercelRequest, res: VercelResponse, user: { id: string; is_anonymous?: boolean }) {
  const userId = user.id;
  // Premium check — Receipt OCR is a premium feature. Guests
  // (anonymous auth users) and non-premium accounts are rejected here
  // too, not just hidden behind the upload zone in ReceiptUploader.tsx,
  // so this endpoint can't be called directly to bypass the paywall.
  if (user.is_anonymous) {
    res.status(403).json({ error: 'Fitur Pindai Struk (AI) memerlukan akun terdaftar (bukan tamu).', code: 'GUEST_NOT_ALLOWED' });
    return;
  }
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', userId)
    .single();
  if (profileError || !profile?.is_premium) {
    res.status(402).json({ error: 'Fitur Pindai Struk (AI) adalah fitur khusus Pengguna Premium.', code: 'PREMIUM_REQUIRED' });
    return;
  }

  // Cek status maintenance & feature lock 'receipt_scan'. Ini wajib dicek
  // di backend juga (bukan cuma di frontend), supaya endpoint ini tidak
  // bisa dipanggil langsung untuk melewati kunci yang diset admin lewat
  // tab Maintenance di Admin Panel.
  const maintenanceStatus = await getMaintenanceStatus(supabase);
  if (isFeatureLocked(maintenanceStatus, 'receipt_scan')) {
    res.status(423).json({ error: 'Fitur Pindai Struk (AI) sedang dikunci oleh admin untuk maintenance.' });
    return;
  }

  // Rate limiting (per user, DB-backed — same atomic pattern as
  // api/parse.ts, see migration 20260823000000_receipt_and_support_rate_limiting.sql).
  // This endpoint calls a paid AI/vision API per request, so it needs its
  // own budget separate from the text/voice parse limits.
  const { data: rateLimitRows, error: rateLimitError } = await supabase.rpc(
    'check_and_increment_receipt_rate_limit',
    {
      p_user_id: userId,
      p_limit: RECEIPT_RATE_LIMIT,
      p_window_seconds: RECEIPT_RATE_LIMIT_WINDOW / 1000,
    }
  );

  if (rateLimitError) {
    // Fail-open on a DB hiccup — same tradeoff as api/parse.ts: an
    // occasional burst is preferable to blocking every legitimate user
    // because the rate-limit table had a transient issue.
    console.error('[receipt/parse] rate limit check failed, failing open:', rateLimitError);
  } else {
    const limitResult = rateLimitRows?.[0];
    if (limitResult && !limitResult.allowed) {
      res.status(429).json({
        error: 'Terlalu banyak permintaan Pindai Struk (AI). Coba lagi sebentar lagi.',
        retryAfter: limitResult.retry_after_seconds,
      });
      return;
    }
  }

  try {
    const { imageBase64, source } = req.body;
    // v0.77.0 (Item 7): kanal asal draf — native mengirim 'ai_native',
    // web tidak mengirim apa-apa (default 'ai_web' supaya web lama tidak
    // rusak). Nilai lain diteruskan apa adanya: receipt_drafts.source
    // TIDAK punya CHECK constraint (terverifikasi live 2026-11-10).
    const draftSource =
      typeof source === 'string' && source.trim() !== '' ? source.trim() : 'ai_web';
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'Missing imageBase64 string of the receipt' });
      return;
    }

    const parsedJSON = await parseReceipt(imageBase64);

    // Save to receipt_drafts table
    const { data: draft, error: dbError } = await supabase
      .from('receipt_drafts')
      .insert({
        user_id: userId,
        merchant_name: parsedJSON.merchant_name || 'Toko Tidak Dikenal',
        receipt_date: toIsoDateOrNull(parsedJSON.receipt_date),
        total_amount: parsedJSON.total_amount || 0,
        total_items: parsedJSON.total_items || (parsedJSON.items ? parsedJSON.items.length : 0),
        items: parsedJSON.items || [],
        raw_ai_response: parsedJSON,
        category: parsedJSON.category || 'other',
        source: draftSource,
        approved: false
      })
      .select()
      .single();

    if (dbError) {
      console.error('SQL Error saving receipt draft:', dbError);
      // Fallback to returning parsed JSON directly if DB insertion fails
      res.json({
        id: null,
        user_id: userId,
        merchant_name: parsedJSON.merchant_name || 'Toko Tidak Dikenal',
        receipt_date: parsedJSON.receipt_date || null,
        total_amount: parsedJSON.total_amount || 0,
        total_items: parsedJSON.total_items || 0,
        items: parsedJSON.items || [],
        approved: false,
        warning: 'Draft Gagal Disimpan di Database Supabase: ' + dbError.message
      });
      return;
    }

    res.json(draft);
  } catch (err: any) {
    console.error('receipt(parse) endpoint error:', err);
    await logError(supabase, {
      source: 'parse-receipt',
      level: 'error',
      message: err?.message ? String(err.message) : 'Terjadi kesalahan internal ketika melakukan OCR struk',
      userId: userId ?? null,
    });
    // v0.77.0 (Item 8, R4): kuota AI habis (semua provider 429/503) BUKAN
    // "server rusak" — kembalikan 503 supaya klien bisa menampilkan pesan
    // kuota yang benar, bukan pesan error generik. Sebelumnya semua
    // kegagalan parse mengembalikan 500 generik.
    const errMessage = err?.message ? String(err.message) : '';
    if (errMessage.includes('All receipt parsing services are currently unavailable')) {
      res.status(503).json({
        error: 'Layanan AI sedang sibuk atau kuota habis, coba lagi beberapa menit lagi.',
        code: 'AI_QUOTA_EXHAUSTED',
      });
      return;
    }
    res.status(500).json({ error: err.message || 'Terjadi kesalahan internal ketika melakukan OCR struk' });
  }
}

async function handleSend(req: VercelRequest, res: VercelResponse, userId: string) {
  try {
    const {
      email,
      customerName,
      orderId,
      amount,
      paymentMethod,
      purchaseDate,
      pdfBase64,
    } = req.body;

    if (!email || !orderId || !pdfBase64) {
      res.status(400).json({ error: 'Missing required fields: email, orderId, or pdfBase64' });
      return;
    }

    const smtpEmail = process.env.SMTP_EMAIL;
    const smtpPassword = process.env.SMTP_PASSWORD;

    if (!smtpEmail || !smtpPassword) {
      throw new Error('SMTP_EMAIL or SMTP_PASSWORD environment variables are not configured.');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpEmail,
        pass: smtpPassword,
      },
    });

    const mailOptions = {
      from: `"E-Wallet Kita" <${smtpEmail}>`,
      to: email,
      subject: 'Struk Pembelian Premium E-Wallet Kita',
      attachments: [
        {
          filename: `Struk-${orderId}.pdf`,
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ],
      html: `
      <h2>Pembayaran Premium Berhasil</h2>

      <p>Halo <b>${customerName}</b>,</p>

      <p>Terima kasih telah membeli Premium E-Wallet Kita.</p>

      <table cellpadding="6" style="border-collapse: collapse;">
        <tr>
          <td><b>Order ID</b></td>
          <td>${orderId}</td>
        </tr>

        <tr>
          <td><b>Tanggal</b></td>
          <td>${purchaseDate}</td>
        </tr>

        <tr>
          <td><b>Metode</b></td>
          <td>${paymentMethod}</td>
        </tr>

        <tr>
          <td><b>Total</b></td>
          <td>${amount}</td>
        </tr>
      </table>

      <br>

      <p>Status :</p>

      <h3 style="color:green">
     LUNAS
      </h3>

      <br>

      <small>
      Terima kasih telah menggunakan E-Wallet Kita.
      </small>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);

    res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    console.error('receipt(send) error:', err);
    await logError(supabase, {
      source: 'send-receipt',
      level: 'error',
      message: err?.message ? String(err.message) : 'Gagal mengirim struk ke email',
      userId: userId ?? null,
      context: { order_id: (req.body as any)?.orderId ?? null, email: (req.body as any)?.email ?? null },
    });
    res.status(500).json({
      success: false,
      error: err.message || 'Terjadi kesalahan internal ketika mengirim struk ke email',
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Auth check shared by both actions.
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const action = (req.query.action as string) || req.body?.action;

  if (action === 'parse') {
    return handleParse(req, res, user);
  }
  if (action === 'send') {
    return handleSend(req, res, user.id);
  }
  return res.status(400).json({ error: 'Parameter action wajib diisi: "parse" atau "send".' });
}
