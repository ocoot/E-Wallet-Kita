import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EXPIRY_SECONDS = 90;

// Angka unik kecil ditambahkan ke total_amount, mengikuti konvensi yang
// sama dipakai KlikQRIS asli (total_amount selalu sedikit beda dari amount
// dasar) supaya tampilan dummy konsisten dengan tampilan transaksi nyata.
function randomUniqueCode(): number {
  return Math.floor(Math.random() * 99) + 1; // 1-99
}

/**
 * Cek pengaturan "Dummy QRIS" yang diatur admin lewat Admin Panel >
 * Monitor Premium (tabel app_settings, key 'dummy_qris_enabled').
 * Fail-safe: kalau gagal dibaca, anggap nonaktif (pakai gateway asli)
 * supaya error pada pengaturan tidak diam-diam mematikan pembayaran nyata.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.split(' ')[1]);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: existing } = await supabase.from('users').select('is_premium').eq('id', user.id).single();
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

  // --- Dummy QRIS mode (diatur admin lewat Admin Panel > Monitor Premium) ---
  // Kalau aktif, JANGAN panggil KlikQRIS asli sama sekali. Buat QR palsu dan
  // simpan transaksi dengan is_sandbox = true; penyelesaian ke status SUCCESS
  // ditangani di api/premium/status.ts (auto-resolve setelah beberapa detik),
  // bukan di sini, supaya tahap "tampil QR -> menunggu" tetap bisa diuji.
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
  } catch (e) {
    console.error('create-transaction error', e);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
