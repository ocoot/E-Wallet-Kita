import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logError } from '../_lib/errorLogger.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const githubToken = process.env.GITHUB_BACKUP_PAT || '';
const githubRepo = process.env.GITHUB_BACKUP_REPO || ''; // format: "owner/repo"

const WORKFLOW_FILES = {
  backup: 'db-backup.yml',
  restore: 'db-restore.yml',
  delete: 'db-backup-delete.yml',
} as const;

const MAX_DELETE_ITEMS = 30;

/**
 * POST /api/admin/backup
 *
 * Endpoint TUNGGAL untuk seluruh aksi terkait backup (backup / restore /
 * delete). SENGAJA digabung dalam satu file -- bukan tiga endpoint terpisah
 * -- supaya tidak menambah jumlah serverless function di Vercel Hobby plan
 * (limit 12 function, project ini sudah mepet).
 *
 * Body: { action: "backup" }                                  (default)
 *       { action: "restore", backup_log_id, scope, table_names? }
 *       { action: "delete", backup_log_ids: string[] }
 *
 * Pola yang sama untuk semua aksi: endpoint ini TIDAK menjalankan
 * pg_dump/pg_restore/rclone sendiri -- Vercel Function kena time-limit,
 * jadi tugas berat selalu didelegasikan ke workflow GitHub Actions lewat
 * workflow_dispatch, dengan PAT yang hanya dikenal server.
 *
 * Auth: Bearer JWT user harus role "admin" atau "owner" (sama seperti pola
 * di api/admin/broadcast.ts).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabaseAnonKey || !supabaseUrl) {
    res.status(500).json({ error: 'Supabase env belum dikonfigurasi' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userSupabase.auth.getUser();
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid token or unauthorized session' });
    return;
  }

  const { data: profile, error: profileError } = await userSupabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !['admin', 'owner'].includes(profile.role)) {
    res.status(403).json({ error: 'Forbidden: Only admins or owners can manage backup' });
    return;
  }

  if (!githubToken || !githubRepo) {
    res.status(500).json({
      error: 'GITHUB_BACKUP_PAT / GITHUB_BACKUP_REPO belum dikonfigurasi di Vercel env',
    });
    return;
  }

  const action = (req.body?.action as string) || 'backup';

  try {
    if (action === 'backup') {
      await handleBackup(user.id, res);
    } else if (action === 'restore') {
      await handleRestore(userSupabase, user.id, req.body, res);
    } else if (action === 'delete') {
      await handleDelete(userSupabase, user.id, req.body, res);
    } else {
      res.status(400).json({ error: `Aksi tidak dikenali: ${action}` });
    }
  } catch (err: any) {
    if (supabaseServiceKey) {
      await logError(createClient(supabaseUrl, supabaseServiceKey), {
        source: 'admin/backup',
        level: 'error',
        message: err?.message || `Unknown error saat aksi backup (action=${action})`,
        userId: user.id,
      });
    }
    res.status(500).json({ error: 'Internal error saat memproses aksi backup' });
  }
}

/** Panggil GitHub REST API untuk memicu workflow_dispatch. */
async function dispatchWorkflow(
  workflowFile: string,
  inputs: Record<string, string>
): Promise<{ ok: true } | { ok: false; status: number; text: string }> {
  const dispatchRes = await fetch(
    `https://api.github.com/repos/${githubRepo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    }
  );

  if (!dispatchRes.ok) {
    return { ok: false, status: dispatchRes.status, text: await dispatchRes.text() };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Action: backup (perilaku lama, tidak berubah)
// ─────────────────────────────────────────────────────────────
async function handleBackup(adminId: string, res: VercelResponse) {
  const result = await dispatchWorkflow(WORKFLOW_FILES.backup, { triggered_by_admin: adminId });

  if (!result.ok) {
    if (supabaseServiceKey) {
      await logError(createClient(supabaseUrl, supabaseServiceKey), {
        source: 'admin/backup',
        level: 'error',
        message: `Gagal memicu GitHub workflow dispatch (backup): ${result.status} ${result.text}`,
        userId: adminId,
      });
    }
    res.status(502).json({ error: 'Gagal memicu workflow backup di GitHub' });
    return;
  }

  // Catatan: workflow butuh beberapa detik untuk mulai & baris log baru
  // muncul di backup_logs. Admin Panel yang memanggil endpoint ini
  // sebaiknya polling get_backup_status() beberapa kali setelah ini.
  res.status(202).json({ message: 'Backup dipicu, sedang berjalan di GitHub Actions' });
}

// ─────────────────────────────────────────────────────────────
// Action: restore (full DB atau table-scope)
// ─────────────────────────────────────────────────────────────
async function handleRestore(
  userSupabase: SupabaseClient,
  adminId: string,
  body: any,
  res: VercelResponse
) {
  const backupLogId = body?.backup_log_id as string | undefined;
  const scope = body?.scope as string | undefined;
  const tableNames: string[] = Array.isArray(body?.table_names) ? body.table_names : [];

  if (!backupLogId || typeof backupLogId !== 'string') {
    res.status(400).json({ error: 'backup_log_id wajib diisi' });
    return;
  }
  if (scope !== 'full' && scope !== 'table') {
    res.status(400).json({ error: 'scope harus "full" atau "table"' });
    return;
  }
  if (scope === 'table' && tableNames.length === 0) {
    res.status(400).json({ error: 'scope=table butuh minimal 1 table_names' });
    return;
  }

  // 1. Ambil data backup yang mau di-restore -- pakai client user (RLS admin)
  //    supaya tidak perlu RPC baru hanya untuk baca satu baris.
  const { data: backupRow, error: backupErr } = await userSupabase
    .from('backup_logs')
    .select('id, status, file_name, storage_path, storage_provider, deleted_at')
    .eq('id', backupLogId)
    .single();

  if (backupErr || !backupRow) {
    res.status(404).json({ error: 'Backup tidak ditemukan' });
    return;
  }
  if (backupRow.status !== 'success') {
    res.status(400).json({ error: 'Hanya backup berstatus "success" yang boleh di-restore' });
    return;
  }
  if (backupRow.deleted_at) {
    res.status(400).json({ error: 'Backup ini sudah dihapus dari storage, tidak bisa di-restore' });
    return;
  }
  if (!backupRow.storage_path) {
    res.status(400).json({ error: 'Backup ini tidak punya storage_path yang valid' });
    return;
  }

  // 2. Kalau table-scope, validasi setiap nama tabel ke allow-list di DB
  //    (public.backup_restorable_tables) -- JANGAN percaya input client
  //    mentah-mentah untuk nama tabel yang akan di-DELETE + pg_restore.
  if (scope === 'table') {
    const { data: allowedRows, error: allowedErr } = await userSupabase
      .from('backup_restorable_tables')
      .select('table_name')
      .eq('is_enabled', true)
      .in('table_name', tableNames);

    if (allowedErr) {
      res.status(500).json({ error: 'Gagal memvalidasi daftar tabel yang boleh di-restore' });
      return;
    }
    const allowedSet = new Set((allowedRows || []).map((r: { table_name: string }) => r.table_name));
    const invalid = tableNames.filter(t => !allowedSet.has(t));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Tabel tidak diizinkan untuk restore: ${invalid.join(', ')}` });
      return;
    }
  }

  // 3. Audit trail permintaan restore (RPC SECURITY DEFINER, sebelum workflow dipicu)
  await userSupabase.rpc('admin_log_backup_action', {
    p_action: 'request_backup_restore',
    p_detail: JSON.stringify({ backup_log_id: backupLogId, scope, table_names: tableNames }),
  });

  // 4. Nyalakan maintenance mode SEBELUM restore jalan, supaya user tidak
  //    menulis data yang nanti ketiban timpa lagi. Pakai JWT admin (bukan
  //    service role) karena RPC ini butuh auth.uid() untuk cek role.
  const scopeLabel = scope === 'full' ? 'seluruh data' : `tabel: ${tableNames.join(', ')}`;
  await userSupabase.rpc('admin_set_maintenance_mode', {
    p_is_active: true,
    p_message_id: `Sedang restore database (${scopeLabel}), mohon tunggu sebentar...`,
    p_message_en: `Database restore in progress (${scopeLabel}), please wait...`,
  });

  if (!supabaseServiceKey) {
    // Rollback maintenance mode kalau tidak bisa lanjut sama sekali.
    await userSupabase.rpc('admin_set_maintenance_mode', { p_is_active: false });
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel env' });
    return;
  }

  const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

  // 5. Insert baris "running" di backup_restore_logs. Workflow HANYA akan
  //    PATCH baris ini nanti (tidak insert sendiri), makanya harus dibuat
  //    di sini dulu supaya kita punya restore_log_id untuk dikirim ke GH Actions.
  const { data: restoreLog, error: insertErr } = await serviceSupabase
    .from('backup_restore_logs')
    .insert({
      source_backup_log_id: backupLogId,
      status: 'running',
      scope,
      table_names: scope === 'table' ? tableNames : null,
      triggered_by_admin: adminId,
    })
    .select('id')
    .single();

  if (insertErr || !restoreLog) {
    await userSupabase.rpc('admin_set_maintenance_mode', { p_is_active: false });
    res.status(500).json({ error: 'Gagal mencatat riwayat restore' });
    return;
  }

  // 6. Picu workflow GitHub Actions
  const dispatchResult = await dispatchWorkflow(WORKFLOW_FILES.restore, {
    restore_log_id: restoreLog.id,
    storage_path: backupRow.storage_path,
    scope,
    table_names: scope === 'table' ? tableNames.join(',') : '',
  });

  if (!dispatchResult.ok) {
    // Rollback: tandai gagal + matikan maintenance mode supaya app tidak
    // terkunci gara-gara workflow bahkan belum sempat mulai.
    await serviceSupabase
      .from('backup_restore_logs')
      .update({
        status: 'failed',
        error_message: `Gagal memicu GitHub workflow dispatch: ${dispatchResult.status}`,
        finished_at: new Date().toISOString(),
      })
      .eq('id', restoreLog.id);
    await userSupabase.rpc('admin_set_maintenance_mode', { p_is_active: false });

    await logError(serviceSupabase, {
      source: 'admin/backup',
      level: 'error',
      message: `Gagal memicu GitHub workflow dispatch (restore): ${dispatchResult.status} ${dispatchResult.text}`,
      userId: adminId,
    });
    res.status(502).json({ error: 'Gagal memicu workflow restore di GitHub' });
    return;
  }

  res.status(202).json({
    message: 'Restore dipicu, sedang berjalan di GitHub Actions',
    restore_log_id: restoreLog.id,
  });
}

// ─────────────────────────────────────────────────────────────
// Action: delete / bulk delete file backup di Google Drive
// ─────────────────────────────────────────────────────────────
async function handleDelete(
  userSupabase: SupabaseClient,
  adminId: string,
  body: any,
  res: VercelResponse
) {
  const ids: string[] = Array.isArray(body?.backup_log_ids) ? body.backup_log_ids : [];

  if (ids.length === 0) {
    res.status(400).json({ error: 'backup_log_ids wajib diisi (minimal 1)' });
    return;
  }
  if (ids.length > MAX_DELETE_ITEMS) {
    res.status(400).json({ error: `Maksimal ${MAX_DELETE_ITEMS} file per batch delete` });
    return;
  }

  const { data: rows, error: rowsErr } = await userSupabase
    .from('backup_logs')
    .select('id, status, storage_path, deleted_at')
    .in('id', ids);

  if (rowsErr) {
    res.status(500).json({ error: 'Gagal mengambil data backup yang akan dihapus' });
    return;
  }

  // Hanya proses baris yang: ditemukan, bukan sedang berjalan, belum
  // dihapus sebelumnya, dan punya storage_path. Baris lain dilaporkan
  // sebagai "skipped" supaya admin tahu kenapa tidak ikut terhapus.
  const validItems = (rows || []).filter(
    (r: { id: string; status: string; storage_path: string | null; deleted_at: string | null }) =>
      r.status !== 'running' && !r.deleted_at && !!r.storage_path
  );
  const validIds = new Set(validItems.map((r: { id: string }) => r.id));
  const skipped = ids.filter(id => !validIds.has(id));

  if (validItems.length === 0) {
    res.status(400).json({ error: 'Tidak ada file valid untuk dihapus', skipped });
    return;
  }

  await userSupabase.rpc('admin_log_backup_action', {
    p_action: 'request_backup_delete',
    p_detail: JSON.stringify({ backup_log_ids: validItems.map((r: { id: string }) => r.id) }),
  });

  const dispatchResult = await dispatchWorkflow(WORKFLOW_FILES.delete, {
    items: JSON.stringify(
      validItems.map((r: { id: string; storage_path: string | null }) => ({
        id: r.id,
        storage_path: r.storage_path,
      }))
    ),
    triggered_by_admin: adminId,
  });

  if (!dispatchResult.ok) {
    if (supabaseServiceKey) {
      await logError(createClient(supabaseUrl, supabaseServiceKey), {
        source: 'admin/backup',
        level: 'error',
        message: `Gagal memicu GitHub workflow dispatch (delete): ${dispatchResult.status} ${dispatchResult.text}`,
        userId: adminId,
      });
    }
    res.status(502).json({ error: 'Gagal memicu workflow delete di GitHub' });
    return;
  }

  res.status(202).json({
    message: 'Penghapusan backup dipicu, sedang berjalan di GitHub Actions',
    queued: Array.from(validIds),
    skipped,
  });
}
