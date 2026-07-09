import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { logError } from '../_lib/errorLogger.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * Unified premium payment endpoint.
 *
 * Replaces three separate functions to stay within Vercel's 12-function limit:
 *   POST  /api/premium/payment  → buat transaksi QRIS baru     (was: create-transaction.ts)
 *   GET   /api/premium/payment  → cek status pembayaran         (was: status.ts)
 *   PUT   /api/premium/payment  → terima webhook dari KlikQRIS  (was: webhook.ts)
 *
 * Auth per method:
 *   POST  — Bearer JWT (user Supabase)
 *   GET   — Bearer JWT (user Supabase), query: ?order_id=<id>
 *   PUT   — Tidak pakai user JWT; validasi pakai signature yang disimpan
 *           saat create (cocok dengan konvensi KlikQRIS webhook).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  switch (req.method) {
    case 'POST':
      return handleCreate(req, res);
    case 'GET':
      return handleStatus(req, res);
    case 'PUT':
      return handleWebhook(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed. Use POST, GET, or PUT.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — auth check (shared oleh POST & GET)
// ─────────────────────────────────────────────────────────────────────────────
async function getUserFromAuth(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.split(' ')[1]);
  if (error || !user) return null;
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dummy QRIS helpers
// ─────────────────────────────────────────────────────────────────────────────
const EXPIRY_SECONDS = 90;

function randomUniqueCode(): number {
  return Math.floor(Math.random() * 99) + 1; // 1-99
}

/**
 * Cek pengaturan "Dummy QRIS" dari tabel app_settings.
 * Fail-safe: kalau gagal dibaca, anggap nonaktif supaya error pada
 * pengaturan tidak diam-diam mematikan pembayaran nyata.
 */
async function isDummyQrisEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'dummy_qris_enabled')
      .single();
    if (error || !data) return false;
    return data.value === 'true';
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Buat transaksi QRIS baru
// (previously: api/premium/create-transaction.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: existing } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', user.id)
    .single();
  if (existing?.is_premium) return res.status(400).json({ error: 'ALREADY_PREMIUM' });

  const { voucherId } = req.body;
  let discountPercent = 0;

  if (voucherId) {
    const { data: voucher } = await supabase
      .from('premium_vouchers')
      .select('*')
      .eq('id', voucherId)
      .eq('is_active', true)
      .is('revoked_at', null)
      .single();

    if (voucher) {
      discountPercent = voucher.discount_percent;
    }
  }

  // Fetch global premium base price from app_settings
  const { data: settingData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'premium_base_price')
    .single();
  const baseAmount = Number(settingData?.value ?? 20000);

  const discountAmount = Math.floor((baseAmount * discountPercent) / 100);
  const finalAmount = baseAmount - discountAmount;
  const orderId = `PREMIUM-${user.id.slice(0, 8)}-${Date.now()}`;
  const expiredAt = new Date(Date.now() + EXPIRY_SECONDS * 1000).toISOString();

  // --- Dummy QRIS mode ---
  if (await isDummyQrisEnabled()) {
    const totalAmount = finalAmount + randomUniqueCode();
    const qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
      `DUMMY-QRIS|${orderId}|${totalAmount}`
    )}`;

    const { error: insertError } = await supabase.from('premium_transactions').insert({
      user_id: user.id,
      order_id: orderId,
      amount: baseAmount,
      total_amount: totalAmount,
      status: 'PENDING',
      qris_url: qrisUrl,
      direct_url: null,
      signature: null,
      is_sandbox: true,
      expired_at: expiredAt,
      voucher_id: voucherId || null,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      final_amount: finalAmount,
    });

    if (insertError) {
      console.error('dummy create-transaction insert error', insertError);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }

    return res.status(200).json({
      data: {
        order_id: orderId,
        amount: baseAmount,
        total_amount: totalAmount,
        qris_url: qrisUrl,
        expired_at: expiredAt,
        status: 'PENDING',
        voucher_id: voucherId || null,
        is_sandbox: true,
      },
    });
  }

  // --- Transaksi KlikQRIS asli ---
  try {
    const klikRes = await fetch('https://klikqris.com/api/qrisv2/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.KLIKQRIS_API_KEY!,
        'id_merchant': process.env.KLIKQRIS_MERCHANT_ID!,
      },
      body: JSON.stringify({
        order_id: orderId,
        id_merchant: process.env.KLIKQRIS_MERCHANT_ID,
        amount: finalAmount,
        keterangan: 'E-Wallet Kita - Premium Lifetime',
      }),
    });
    const klikJson = await klikRes.json();
    if (!klikJson?.status || !klikJson?.data) {
      return res.status(502).json({ error: 'KLIKQRIS_CREATE_FAILED' });
    }

    const d = klikJson.data;

    await supabase.from('premium_transactions').insert({
      user_id: user.id,
      order_id: orderId,
      amount: baseAmount,
      total_amount: Math.round(parseFloat(d.total_amount)),
      status: 'PENDING',
      qris_url: d.qris_url,
      direct_url: d.direct_url,
      signature: d.signature,
      is_sandbox: false,
      expired_at: expiredAt,
      voucher_id: voucherId || null,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      final_amount: finalAmount,
    });

    return res.status(200).json({
      data: {
        order_id: orderId,
        amount: baseAmount,
        total_amount: Math.round(parseFloat(d.total_amount)),
        qris_url: d.qris_url,
        expired_at: expiredAt,
        status: 'PENDING',
        voucher_id: voucherId || null,
        is_sandbox: false,
      },
    });
  } catch (e: any) {
    console.error('create-transaction error', e);
    await logError(supabase, {
      source: "premium/payment:create",
      level: "error",
      message: e?.message ? String(e.message) : "Gagal membuat transaksi premium",
      userId: user?.id ?? null,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — Cek status pembayaran
// (previously: api/premium/status.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function handleStatus(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Surrogate-Control', 'no-store');

  const user = await getUserFromAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const orderId = req.query.order_id as string;
  if (!orderId) return res.status(400).json({ error: 'order_id required' });

  const { data: localTx } = await supabase
    .from('premium_transactions')
    .select('*, premium_vouchers(*)')
    .eq('order_id', orderId)
    .eq('user_id', user.id)
    .single();
  if (!localTx) return res.status(404).json({ error: 'NOT_FOUND' });

  const response = {
    status: localTx.status,
    voucher_id: localTx.voucher_id,
    discount_percent: localTx.discount_percent,
    final_amount: localTx.final_amount,
  };

  // Local 90s expiry check
  if (localTx.status === 'PENDING' && new Date(localTx.expired_at).getTime() < Date.now()) {
    await supabase
      .from('premium_transactions')
      .update({ status: 'EXPIRED' })
      .eq('order_id', orderId);
    return res.status(200).json({ ...response, status: 'EXPIRED' });
  }

  if (localTx.status !== 'PENDING') {
    return res.status(200).json(response);
  }

  // --- Dummy QRIS mode ---
  // Selesaikan sendiri di sini; jangan pernah panggil API KlikQRIS asli
  // untuk transaksi sandbox. Dicek dari flag pada baris transaksi itu
  // sendiri (bukan membaca ulang setting dummy_qris_enabled) supaya tetap
  // konsisten walau admin sudah menonaktifkan toggle-nya setelah transaksi
  // ini dibuat.
  if (localTx.is_sandbox) {
    const DUMMY_AUTO_SUCCESS_DELAY_MS = 8000;
    const ageMs = Date.now() - new Date(localTx.created_at).getTime();

    if (ageMs >= DUMMY_AUTO_SUCCESS_DELAY_MS) {
      await supabase
        .from('premium_transactions')
        .update({ status: 'SUCCESS', paid_at: new Date().toISOString() })
        .eq('order_id', orderId);
      await supabase
        .from('users')
        .update({ is_premium: true, premium_paid_at: new Date().toISOString() })
        .eq('id', user.id);
      return res.status(200).json({ status: 'SUCCESS' });
    }
    return res.status(200).json({ status: 'PENDING' });
  }

  // --- KlikQRIS status check ---
  try {
    const klikRes = await fetch(
      `https://klikqris.com/api/qrisv2/status/${process.env.KLIKQRIS_MERCHANT_ID}/${orderId}`,
      {
        headers: {
          'x-api-key': process.env.KLIKQRIS_API_KEY!,
          'id_merchant': process.env.KLIKQRIS_MERCHANT_ID!,
        },
      }
    );
    const klikJson = await klikRes.json();
    const remoteStatus = klikJson?.data?.status;

    if (remoteStatus === 'SUCCESS') {
      await supabase
        .from('premium_transactions')
        .update({ status: 'SUCCESS', paid_at: new Date().toISOString() })
        .eq('order_id', orderId);
      await supabase
        .from('users')
        .update({ is_premium: true, premium_paid_at: new Date().toISOString() })
        .eq('id', user.id);
      return res.status(200).json({ status: 'SUCCESS' });
    }
    if (remoteStatus === 'EXPIRED') {
      await supabase
        .from('premium_transactions')
        .update({ status: 'EXPIRED' })
        .eq('order_id', orderId);
      return res.status(200).json({ status: 'EXPIRED' });
    }
    return res.status(200).json({ status: 'PENDING' });
  } catch (e: any) {
    console.error('status check error', e);
    await logError(supabase, {
      source: "premium/payment:status",
      level: "warning",
      message: e?.message ? String(e.message) : "Gagal cek status pembayaran (fail-soft, tetap polling)",
      userId: user?.id ?? null,
    });
    return res.status(200).json({ status: 'PENDING' }); // fail-soft, keep polling
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT — Terima webhook dari KlikQRIS
// (previously: api/premium/webhook.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function handleWebhook(req: VercelRequest, res: VercelResponse) {
  try {
    const payload = req.body?.data;
    if (!payload?.order_id || !payload?.signature) {
      res.status(200).json({ received: true }); // ack 200 walau payload aneh
      return;
    }

    const { data: localTx } = await supabase
      .from('premium_transactions')
      .select('*')
      .eq('order_id', payload.order_id)
      .single();

    if (!localTx) { res.status(200).json({ received: true }); return; }

    // Validasi signature harus sama dengan saat create transaction
    if (localTx.signature !== payload.signature) {
      console.warn('Webhook signature mismatch, ignoring', payload.order_id);
      res.status(200).json({ received: true });
      return;
    }

    // Hindari pengiriman produk ganda
    if (localTx.status === 'SUCCESS') {
      res.status(200).json({ received: true });
      return;
    }

    if (payload.status === 'PAID' || payload.status === 'SUCCESS') {
      await supabase
        .from('premium_transactions')
        .update({
          status: 'SUCCESS',
          paid_at: new Date().toISOString(),
          paid_amount: localTx.final_amount,
          discount_amount: localTx.discount_amount,
          voucher_id: localTx.voucher_id,
        })
        .eq('order_id', payload.order_id);
      await supabase
        .from('users')
        .update({ is_premium: true, premium_paid_at: new Date().toISOString() })
        .eq('id', localTx.user_id);
    } else if (payload.status === 'EXPIRED') {
      await supabase
        .from('premium_transactions')
        .update({ status: 'EXPIRED' })
        .eq('order_id', payload.order_id);
    }

    res.status(200).json({ received: true });
  } catch (e: any) {
    console.error('webhook error', e);
    await logError(supabase, {
      source: "premium/payment:webhook",
      level: "error",
      message: e?.message ? String(e.message)
        : "Webhook KlikQRIS gagal diproses tapi tetap dibalas 200 (lihat context untuk order_id) — cek manual apakah status premium user perlu dikoreksi.",
      context: { order_id: (req.body as any)?.data?.order_id ?? null },
    });
    res.status(200).json({ received: true }); // KlikQRIS butuh 200 walau ada error internal
  }
}
