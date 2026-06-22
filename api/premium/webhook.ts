import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = req.body?.data;
    if (!payload?.order_id || !payload?.signature) {
      res.status(200).json({ received: true }); // ack tetap 200 walau payload aneh
      return;
    }

    const { data: localTx } = await supabase
      .from('premium_transactions')
      .select('*')
      .eq('order_id', payload.order_id)
      .single();

    if (!localTx) { res.status(200).json({ received: true }); return; }

    // Double security: validasi signature harus sama dengan saat create transaction
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
      await supabase.from('premium_transactions').update({ status: 'SUCCESS', paid_at: new Date().toISOString() }).eq('order_id', payload.order_id);
      await supabase.from('users').update({ is_premium: true, premium_paid_at: new Date().toISOString() }).eq('id', localTx.user_id);
    } else if (payload.status === 'EXPIRED') {
      await supabase.from('premium_transactions').update({ status: 'EXPIRED' }).eq('order_id', payload.order_id);
    }

    res.status(200).json({ received: true });
  } catch (e) {
    console.error('webhook error', e);
    res.status(200).json({ received: true }); // KlikQRIS butuh 200 walau ada error internal kita
  }
}
