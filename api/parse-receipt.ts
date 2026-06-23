import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { parseReceipt } from './lib/receipt-parser.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 1. Auth check
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

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({ error: "Missing imageBase64 string of the receipt" });
      return;
    }

    const parsedJSON = await parseReceipt(imageBase64);

    // Save to receipt_drafts table
    const { data: draft, error: dbError } = await supabase
      .from('receipt_drafts')
      .insert({
        user_id: user.id,
        merchant_name: parsedJSON.merchant_name || 'Toko Tidak Dikenal',
        receipt_date: parsedJSON.receipt_date ? new Date(parsedJSON.receipt_date).toISOString() : new Date().toISOString(),
        total_amount: parsedJSON.total_amount || 0,
        total_items: parsedJSON.total_items || (parsedJSON.items ? parsedJSON.items.length : 0),
        items: parsedJSON.items || [],
        raw_ai_response: parsedJSON,
        source: 'ai_web',
        approved: false
      })
      .select()
      .single();

    if (dbError) {
      console.error("❌ SQL Error saving receipt draft:", dbError);
      // Fallback to returning parsed JSON directly if DB insertion fails
      res.json({
        id: null,
        user_id: user.id,
        merchant_name: parsedJSON.merchant_name || 'Toko Tidak Dikenal',
        receipt_date: parsedJSON.receipt_date || new Date().toISOString(),
        total_amount: parsedJSON.total_amount || 0,
        total_items: parsedJSON.total_items || 0,
        items: parsedJSON.items || [],
        approved: false,
        warning: "Draft Gagal Disimpan di Database Supabase: " + dbError.message
      });
      return;
    }

    res.json(draft);

  } catch (err: any) {
    console.error("❌ parse-receipt endpoint error:", err);
    res.status(500).json({ error: err.message || "Terjadi kesalahan internal ketika melakukan OCR struk" });
  }
}
