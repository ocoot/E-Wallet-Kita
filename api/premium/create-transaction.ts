import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const AMOUNT = 501;
const EXPIRY_SECONDS = 90;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.split(' ')[1]);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: existing } = await supabase.from('users').select('is_premium').eq('id', user.id).single();
  if (existing?.is_premium) return res.status(400).json({ error: 'ALREADY_PREMIUM' });

  const orderId = `PREMIUM-${user.id.slice(0, 8)}-${Date.now()}`;

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
        amount: AMOUNT,
        keterangan: 'E-Wallet Kita - Premium Lifetime',
      }),
    });
    const klikJson = await klikRes.json();
    if (!klikJson?.status || !klikJson?.data) {
      return res.status(502).json({ error: 'KLIKQRIS_CREATE_FAILED' });
    }

    const d = klikJson.data;
    const expiredAt = new Date(Date.now() + EXPIRY_SECONDS * 1000).toISOString(); // enforce 01:30 locally

    await supabase.from('premium_transactions').insert({
      user_id: user.id,
      order_id: orderId,
      amount: AMOUNT,
      total_amount: Math.round(parseFloat(d.total_amount)),
      status: 'PENDING',
      qris_url: d.qris_url,
      direct_url: d.direct_url,
      signature: d.signature,
      is_sandbox: false,
      expired_at: expiredAt,
    });

    return res.status(200).json({
      data: {
        order_id: orderId,
        amount: AMOUNT,
        total_amount: Math.round(parseFloat(d.total_amount)),
        qris_url: d.qris_url,
        expired_at: expiredAt,
        status: 'PENDING',
      },
    });
  } catch (e) {
    console.error('create-transaction error', e);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
