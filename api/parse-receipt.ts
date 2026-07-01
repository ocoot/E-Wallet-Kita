import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { parseReceipt } from './_lib/receipt-parser.js';
import { getMaintenanceStatus, isFeatureLocked } from './_lib/maintenance.js';

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
  
  console.log("=== OCR AUTH DEBUG ===");
  console.log("Authorization exists:", !!authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log("Authorization header invalid or missing");
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.split(' ')[1];
  console.log("Token exists:", !!token);
  console.log("Token preview:", token?.substring(0, 40));

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  console.log("AUTH ERROR:", authError);
  console.log("AUTH USER:", user?.id);

  if (authError || !user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // 1b. Premium check — Receipt OCR is a premium feature. Guests
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
    .eq('id', user.id)
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
        category: parsedJSON.category || 'other',
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
