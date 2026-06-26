import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Surrogate-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.split(' ')[1]);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const orderId = req.query.order_id as string;
  if (!orderId) return res.status(400).json({ error: 'order_id required' });

  const { data: localTx } = await supabase.from('premium_transactions').select('*, premium_vouchers(*)').eq('order_id', orderId).eq('user_id', user.id).single();
  if (!localTx) return res.status(404).json({ error: 'NOT_FOUND' });

  // Add voucher info to response
  const response = {
    status: localTx.status,
    voucher_id: localTx.voucher_id,
    discount_percent: localTx.discount_percent,
    final_amount: localTx.final_amount,
  };

  // local 90s expiry enforced regardless of provider state
  if (localTx.status === 'PENDING' && new Date(localTx.expired_at).getTime() < Date.now()) {
    await supabase.from('premium_transactions').update({ status: 'EXPIRED' }).eq('order_id', orderId);
    return res.status(200).json({ ...response, status: 'EXPIRED' });
  }
  if (localTx.status !== 'PENDING') {
    return res.status(200).json(response);
  }

  // --- Dummy QRIS mode ---
  // Transaksi ini dibuat sebagai dummy oleh api/premium/create-transaction.ts
  // (is_sandbox = true) ketika toggle "Dummy QRIS" aktif di Admin Panel.
  // Jangan pernah panggil API KlikQRIS asli untuk transaksi semacam ini --
  // selesaikan sendiri di sini dengan auto-resolve ke SUCCESS setelah
  // beberapa detik, supaya alur polling di PremiumModal.tsx tetap teruji
  // persis seperti transaksi nyata, tanpa pernah menyentuh gateway asli.
  // Sengaja dicek dari flag pada baris transaksi itu sendiri (bukan
  // membaca ulang setting dummy_qris_enabled), supaya tetap konsisten
  // diselesaikan sebagai dummy walau admin sudah menonaktifkan togglenya
  // setelah transaksi ini dibuat.
  if (localTx.is_sandbox) {
    const DUMMY_AUTO_SUCCESS_DELAY_MS = 8000;
    const ageMs = Date.now() - new Date(localTx.created_at).getTime();

    if (ageMs >= DUMMY_AUTO_SUCCESS_DELAY_MS) {
      await supabase.from('premium_transactions').update({ status: 'SUCCESS', paid_at: new Date().toISOString() }).eq('order_id', orderId);
      await supabase.from('users').update({ is_premium: true, premium_paid_at: new Date().toISOString() }).eq('id', user.id);
      return res.status(200).json({ status: 'SUCCESS' });
    }
    return res.status(200).json({ status: 'PENDING' });
  }

  try {
    const klikRes = await fetch(`https://klikqris.com/api/qrisv2/status/${process.env.KLIKQRIS_MERCHANT_ID}/${orderId}`, {
      headers: {
        'x-api-key': process.env.KLIKQRIS_API_KEY!,
        'id_merchant': process.env.KLIKQRIS_MERCHANT_ID!,
      },
    });
    const klikJson = await klikRes.json();
    const remoteStatus = klikJson?.data?.status;

    if (remoteStatus === 'SUCCESS') {
      await supabase.from('premium_transactions').update({ status: 'SUCCESS', paid_at: new Date().toISOString() }).eq('order_id', orderId);
      await supabase.from('users').update({ is_premium: true, premium_paid_at: new Date().toISOString() }).eq('id', user.id);
      return res.status(200).json({ status: 'SUCCESS' });
    }
    if (remoteStatus === 'EXPIRED') {
      await supabase.from('premium_transactions').update({ status: 'EXPIRED' }).eq('order_id', orderId);
      return res.status(200).json({ status: 'EXPIRED' });
    }
    return res.status(200).json({ status: 'PENDING' });
  } catch (e) {
    console.error('status check error', e);
    return res.status(200).json({ status: 'PENDING' }); // fail-soft, keep polling
  }
}
