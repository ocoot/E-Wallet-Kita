import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { logError } from '../_lib/errorLogger.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Kontrol privasi & data milik user sendiri (self-service).
 *
 * GET    /api/account/privacy  → ekspor seluruh data pribadi user sebagai JSON
 * DELETE /api/account/privacy  → hapus akun & seluruh data pribadi permanen
 *
 * Kenapa endpoint baru, bukan RLS langsung dari client:
 *   - Ekspor perlu menggabungkan banyak tabel sekaligus (transactions,
 *     budgets, bill_reminders, installments, receipt_drafts, dll) --
 *     lebih efisien & aman dilakukan satu kali di server dengan service
 *     role + filter user_id yang sudah diverifikasi dari JWT, daripada
 *     client melakukan banyak query terpisah.
 *   - Hapus akun butuh menghapus baris auth.users lewat Admin API
 *     (supabase.auth.admin.deleteUser), yang HANYA bisa dipanggil dengan
 *     service role key -- tidak mungkin dilakukan langsung dari client.
 *
 * Auth: Bearer JWT (user Supabase, tidak perlu role admin -- ini aksi
 * terhadap akun sendiri).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  switch (req.method) {
    case 'GET':
      return handleExport(req, res);
    case 'DELETE':
      return handleDeleteAccount(req, res);
    default:
      res.setHeader('Allow', 'GET, DELETE');
      return res.status(405).json({ error: 'Method not allowed. Use GET or DELETE.' });
  }
}

async function getUserFromAuth(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.split(' ')[1]);
  if (error || !user) return null;
  return user;
}

// ─────────────────────────────────────────────────────────────────────────
// GET — Ekspor semua data pribadi user sebagai satu file JSON
// ─────────────────────────────────────────────────────────────────────────
async function handleExport(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const [
      profileRes,
      transactionsRes,
      budgetsRes,
      billRemindersRes,
      installmentsRes,
      receiptDraftsRes,
      premiumTransactionsRes,
      voucherClaimsRes,
    ] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase.from('transactions').select('*').eq('user_id', user.id).order('transaction_date', { ascending: true }),
      supabase.from('budgets').select('*').eq('user_id', user.id),
      supabase.from('bill_reminders').select('*').eq('user_id', user.id),
      supabase.from('installments').select('*').eq('user_id', user.id),
      supabase.from('receipt_drafts').select('*').eq('user_id', user.id),
      supabase.from('premium_transactions').select('*').eq('user_id', user.id),
      supabase.from('user_voucher_claims').select('*').eq('user_id', user.id),
    ]);

    // Kolom internal yang tidak perlu (atau tidak seharusnya) diekspor ke
    // user: role & is_banned adalah metadata moderasi, bukan "data milik
    // mereka" dalam pengertian privasi.
    const profile = profileRes.data
      ? (({ role, is_banned, ...rest }: any) => rest)(profileRes.data)
      : null;

    const exportPayload = {
      export_version: 1,
      exported_at: new Date().toISOString(),
      account: profile,
      transactions: transactionsRes.data || [],
      budgets: budgetsRes.data || [],
      bill_reminders: billRemindersRes.data || [],
      installments: installmentsRes.data || [],
      receipt_scan_drafts: receiptDraftsRes.data || [],
      premium_transactions: premiumTransactionsRes.data || [],
      voucher_claims: voucherClaimsRes.data || [],
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ewallet-kita-data-${user.id.slice(0, 8)}.json"`
    );
    return res.status(200).json(exportPayload);
  } catch (e: any) {
    console.error('privacy export error', e);
    await logError(supabase, {
      source: "account/privacy:export",
      level: "error",
      message: e?.message ? String(e.message) : "Gagal mengekspor data privasi user",
      userId: user?.id ?? null,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DELETE — Hapus akun & seluruh data pribadi user secara permanen
// ─────────────────────────────────────────────────────────────────────────
async function handleDeleteAccount(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Konfirmasi eksplisit dari body request, bukan cuma method DELETE --
  // mencegah penghapusan tidak sengaja lewat panggilan otomatis/replay.
  const confirmation = req.body?.confirmation;
  if (confirmation !== 'DELETE') {
    return res.status(400).json({ error: 'CONFIRMATION_REQUIRED' });
  }

  try {
    // 1. Hapus seluruh data di skema public (lihat migration
    //    20260731020000_self_service_account_deletion.sql untuk detail
    //    urutan & tabel yang tercakup).
    const { data: deleted, error: rpcError } = await supabase.rpc('delete_own_account_data', {
      p_user_id: user.id,
    });

    if (rpcError || deleted !== true) {
      console.error('delete_own_account_data error', rpcError);
      await logError(supabase, {
        source: "account/privacy:delete",
        level: "error",
        message: rpcError?.message || "delete_own_account_data gagal atau mengembalikan false",
        userId: user.id,
      });
      return res.status(500).json({ error: 'DATA_DELETE_FAILED' });
    }

    // 2. Hapus akun auth (baris auth.users). Ini juga men-trigger cascade
    //    untuk tabel yang FK langsung ke auth.users (support_sessions,
    //    user_push_tokens). Dilakukan TERAKHIR supaya kalau langkah ini
    //    gagal, data di step 1 sudah bersih tapi user masih bisa login
    //    lagi untuk mencoba ulang -- lebih aman daripada auth-nya
    //    terhapus duluan tapi datanya nyangkut.
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      console.error('auth.admin.deleteUser error', authDeleteError);
      await logError(supabase, {
        source: "account/privacy:delete",
        level: "error",
        message: `auth.admin.deleteUser gagal SETELAH data public sudah terhapus (akun orphaned): ${authDeleteError.message}`,
        userId: user.id,
      });
      return res.status(500).json({ error: 'AUTH_DELETE_FAILED' });
    }

    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error('delete account error', e);
    await logError(supabase, {
      source: "account/privacy:delete",
      level: "error",
      message: e?.message ? String(e.message) : "Gagal menghapus akun",
      userId: user?.id ?? null,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
