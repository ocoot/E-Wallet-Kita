import { createClient } from '@supabase/supabase-js';
import { logError } from './errorLogger.js';

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
  telegramChatId?: string,
  categoryOptions?: { key: string; label_id: string | null; label_en: string | null }[]
) {
  // Resolve pos dompet default ("Saldo Total") begitu draft dibuat, supaya
  // draft selalu punya wallet_id konkret sejak awal -- kode di bawah/di
  // webhook tidak perlu menangani NULL, dan user tinggal ganti kalau mau
  // lewat tombol "Ganti Pos Dompet".
  let defaultWalletId: string | null = null;
  try {
    const { data: walletId, error: walletErr } = await supabaseBackend.rpc('ensure_general_wallet', { p_user_id: userId });
    if (!walletErr) defaultWalletId = walletId as string;
  } catch (err) {
    console.error("Gagal resolve wallet default untuk receipt draft:", err);
    void logError(supabaseBackend, {
      source: "receipt-service",
      message: err instanceof Error ? err.message : String(err),
      userId,
      context: { fn: "createReceiptDraft", stage: "resolve-default-wallet" },
    });
  }

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
      category: parsed.category || 'other',
      category_options: categoryOptions ?? null,
      wallet_id: defaultWalletId,
      approved: false,
      source,
      telegram_chat_id: telegramChatId ? String(telegramChatId) : null
    })
    .select()
    .single();

  if (error) {
    console.error("Error in createReceiptDraft:", error);
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
    console.error("Error in getReceiptDraft:", error);
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
  const category = draft.category || 'monthly_groceries';

  // Jaring pengaman: draft lama (dari sebelum kolom wallet_id ada) mungkin
  // belum punya wallet_id. Resolve ke Saldo Total kalau begitu.
  let walletId = draft.wallet_id || null;
  if (!walletId) {
    try {
      const { data: fallbackWalletId } = await supabaseBackend.rpc('ensure_general_wallet', { p_user_id: draft.user_id });
      walletId = fallbackWalletId as string;
    } catch (err) {
      console.error("Gagal resolve wallet fallback saat approve receipt draft:", err);
    }
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
      transaction_date: draft.receipt_date ? new Date(draft.receipt_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      wallet_id: walletId
    })
    .select()
    .single();

  if (txErr) {
    console.error("Error inserting transaction from receipt:", txErr);
    throw txErr;
  }

  // 3. Mark approved
  const { error: updErr } = await supabaseBackend
    .from('receipt_drafts')
    .update({ approved: true })
    .eq('id', id);

  if (updErr) {
    console.error("Error updating receipt draft to approved:", updErr);
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
    console.error("Error deleting receipt draft:", error);
    throw error;
  }
  return data;
}

export async function updateReceiptCategory(id: string, category: string) {
  const { data, error } = await supabaseBackend
    .from('receipt_drafts')
    .update({ 
      category: category,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error("Error in updateReceiptCategory:", error);
    throw error;
  }
  return data;
}

export async function updateReceiptWallet(id: string, walletId: string) {
  const { data, error } = await supabaseBackend
    .from('receipt_drafts')
    .update({ wallet_id: walletId })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error("Error in updateReceiptWallet:", error);
    throw error;
  }
  return data;
}
