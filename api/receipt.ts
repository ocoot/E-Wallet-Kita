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

/**
 * POST /api/receipt  { action: "parse", imageBase64 }
 *   → OCR struk (dulu: api/parse-receipt.ts). Premium-only.
 * POST /api/receipt  { action: "send", email, orderId, pdfBase64, ... }
 *   → kirim struk pembelian premium via email (dulu: api/send-receipt.ts)
 *
 * Digabung supaya tidak menambah jumlah serverless function di Vercel
 * Hobby plan (limit 12 function/project). Keduanya sama-sama butuh
 * Bearer auth, jadi auth check dilakukan sekali di awal handler().
 */

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

  try {
    const { imageBase64 } = req.body;
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
        receipt_date: parsedJSON.receipt_date ? new Date(parsedJSON.receipt_date).toISOString() : new Date().toISOString(),
        total_amount: parsedJSON.total_amount || 0,
        total_items: parsedJSON.total_items || (parsedJSON.items ? parsedJSON.items.length : 0),
        items: parsedJSON.items || [],
        raw_ai_response: parsedJSON,
        category: parsedJSON.category || 'other',
        source: 'ai_web',
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
        receipt_date: parsedJSON.receipt_date || new Date().toISOString(),
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
