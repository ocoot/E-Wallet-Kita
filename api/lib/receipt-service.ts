import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}
const supabaseBackend = createClient(supabaseUrl, supabaseServiceKey);

export async function createReceiptDraft(
  userId: string,
  parsed: any,
  source: string,
  telegramChatId?: string
) {
  const { data, error } = await supabaseBackend
    .from('receipt_drafts')
    .insert({
      user_id: userId,
      merchant_name: parsed.merchant_name || 'Toko Tidak Dikenal',
      receipt_date: parsed.receipt_date ? new Date(parsed.receipt_date).toISOString() : new Date().toISOString(),
      total_amount: parsed.total_amount || 0,
      total_items: parsed.total_items || (parsed.items ? parsed.items.length : 0),
      items: parsed.items || [],
      raw_ai_response: parsed,
      approved: false,
      source,
      telegram_chat_id: telegramChatId ? String(telegramChatId) : null
    })
    .select()
    .single();

  if (error) {
    console.error("❌ Error in createReceiptDraft:", error);
    throw error;
  }
  return data;
}

export async function getReceiptDraft(id: string) {
  const { data, error } = await supabaseBackend
    .from('receipt_drafts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error("❌ Error in getReceiptDraft:", error);
    return null;
  }
  return data;
}

export async function approveReceiptDraft(id: string) {
  // 1. Get draft
  const draft = await getReceiptDraft(id);
  if (!draft) {
    throw new Error("Draf struk tidak ditemukan atau telah kedaluwarsa.");
  }

  if (draft.approved) {
    // Already approved, avoid double transaction issue
    return { draft, transaction: null };
  }

  // 2. Insert transaction
  // Find a suitable category for the transaction, defaulting to monthly_groceries
  let category = 'monthly_groceries';
  if (draft.items && draft.items.length > 0) {
    // If we have items, we can optionally map them, but monthly_groceries is the safest default
    category = 'monthly_groceries';
  }

  const { data: tx, error: txErr } = await supabaseBackend
    .from('transactions')
    .insert({
      user_id: draft.user_id,
      type: 'expense',
      category: category,
      amount: draft.total_amount || 0,
      note: `${draft.total_items || 0} item barang (${draft.merchant_name || 'Toko Tidak Dikenal'})`,
      source: 'telegram',
      transaction_date: draft.receipt_date ? new Date(draft.receipt_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    })
    .select()
    .single();

  if (txErr) {
    console.error("❌ Error inserting transaction from receipt:", txErr);
    throw txErr;
  }

  // 3. Mark approved
  const { error: updErr } = await supabaseBackend
    .from('receipt_drafts')
    .update({ approved: true })
    .eq('id', id);

  if (updErr) {
    console.error("❌ Error updating receipt draft to approved:", updErr);
  }

  return { draft: { ...draft, approved: true }, transaction: tx };
}

export async function cancelReceiptDraft(id: string) {
  const { data, error } = await supabaseBackend
    .from('receipt_drafts')
    .delete()
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error("❌ Error deleting receipt draft:", error);
    throw error;
  }
  return data;
}
