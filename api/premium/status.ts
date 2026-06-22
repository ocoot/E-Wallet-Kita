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

  const { data: localTx } = await supabase.from('premium_transactions').select('*').eq('order_id', orderId).eq('user_id', user.id).single();
  if (!localTx) return res.status(404).json({ error: 'NOT_FOUND' });

  // local 90s expiry enforced regardless of provider state
  if (localTx.status === 'PENDING' && new Date(localTx.expired_at).getTime() < Date.now()) {
    await supabase.from('premium_transactions').update({ status: 'EXPIRED' }).eq('order_id', orderId);
    return res.status(200).json({ status: 'EXPIRED' });
  }
  if (localTx.status !== 'PENDING') {
    return res.status(200).json({ status: localTx.status });
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
