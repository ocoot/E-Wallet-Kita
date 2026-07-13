import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { logError } from '../_lib/errorLogger.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const githubToken = process.env.GITHUB_BACKUP_PAT || '';
const githubRepo = process.env.GITHUB_BACKUP_REPO || ''; // format: "owner/repo"
const githubWorkflowFile = 'db-backup.yml';

/**
 * POST /api/admin/backup
 *
 * Memicu workflow GitHub Actions "db-backup.yml" secara manual (tombol
 * "Backup Sekarang" di Admin Panel). Endpoint ini SENGAJA tidak menjalankan
 * pg_dump/rclone sendiri -- Vercel Function punya time-limit (lihat
 * maxDuration di vercel.json) yang terlalu pendek untuk proses backup+upload,
 * jadi tugas berat itu tetap didelegasikan ke GitHub Actions runner yang
 * tidak punya batas waktu seketat itu. Endpoint ini hanya "menyalakan tombol"
 * lewat GitHub REST API (workflow_dispatch), dengan PAT yang hanya dikenal
 * server (tidak pernah dikirim ke browser).
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
    res.status(403).json({ error: 'Forbidden: Only admins or owners can trigger backup' });
    return;
  }

  if (!githubToken || !githubRepo) {
    res.status(500).json({
      error: 'GITHUB_BACKUP_PAT / GITHUB_BACKUP_REPO belum dikonfigurasi di Vercel env',
    });
    return;
  }

  try {
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${githubRepo}/actions/workflows/${githubWorkflowFile}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { triggered_by_admin: user.id },
        }),
      }
    );

    if (!dispatchRes.ok) {
      const text = await dispatchRes.text();
      if (supabaseServiceKey) {
        await logError(createClient(supabaseUrl, supabaseServiceKey), {
          source: 'admin/backup',
          level: 'error',
          message: `Gagal memicu GitHub workflow dispatch: ${dispatchRes.status} ${text}`,
        });
      }
      res.status(502).json({ error: 'Gagal memicu workflow backup di GitHub' });
      return;
    }

    // Catatan: workflow butuh beberapa detik untuk mulai & baris log baru
    // muncul di backup_logs. Admin Panel yang memanggil endpoint ini
    // sebaiknya polling get_backup_status() beberapa kali setelah ini.
    res.status(202).json({ message: 'Backup dipicu, sedang berjalan di GitHub Actions' });
  } catch (err: any) {
    if (supabaseServiceKey) {
      await logError(createClient(supabaseUrl, supabaseServiceKey), {
        source: 'admin/backup',
        level: 'error',
        message: err?.message || 'Unknown error saat memicu backup',
      });
    }
    res.status(500).json({ error: 'Internal error saat memicu backup' });
  }
}
