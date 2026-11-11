import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { logError } from '../_lib/errorLogger.js';
import { enforceRateLimit } from '../_lib/rateLimiter.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * Unified premium payment endpoint.
 *
 * Replaces three separate functions to stay within Vercel's 12-function limit:
 *   POST  /api/premium/payment  → buat transaksi QRIS baru     (was: create-transaction.ts)
 *   GET   /api/premium/payment  → cek status pembayaran         (was: status.ts)
 *   PUT   /api/premium/payment  → terima webhook dari KlikQRIS  (was: webhook.ts)
 *
 * Auth per method:
 *   POST  — Bearer JWT (user Supabase)
 *   GET   — Bearer JWT (user Supabase), query: ?order_id=<id>
 *   PUT   — Tidak pakai user JWT; validasi pakai signature yang disimpan
 *           saat create (cocok dengan konvensi KlikQRIS webhook).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Trigger reconciliation dari GitHub Actions (lihat
  // .github/workflows/premium-payment-reconcile.yml), bukan Vercel native
  // cron. Workflow itu mengirim GET dengan header
  // `Authorization: Bearer <CRON_SECRET>` -- CRON_SECRET harus di-set sama
  // persis di env var Vercel & secret GitHub Actions. Dicegat di sini,
  // sebelum switch method biasa, supaya tidak nambah endpoint baru
  // (project ini sengaja digabung untuk tetap di bawah limit 12 function
  // di Vercel Hobby plan).
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return handleReconcile(req, res);
  }

  switch (req.method) {
    case 'POST':
      return handleCreate(req, res);
    case 'GET':
      return handleStatus(req, res);
    case 'PUT':
      return handleWebhook(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed. Use POST, GET, or PUT.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — auth check (shared oleh POST & GET)
// ─────────────────────────────────────────────────────────────────────────────
async function getUserFromAuth(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.split(' ')[1]);
  if (error || !user) return null;
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dummy QRIS helpers
// ─────────────────────────────────────────────────────────────────────────────
const EXPIRY_SECONDS = 90;

function randomUniqueCode(): number {
  return Math.floor(Math.random() * 99) + 1; // 1-99
}

/**
 * Cek pengaturan "Dummy QRIS" dari tabel app_settings.
 * Fail-safe: kalau gagal dibaca, anggap nonaktif supaya error pada
 * pengaturan tidak diam-diam mematikan pembayaran nyata.
 */
async function isDummyQrisEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'dummy_qris_enabled')
      .single();
    if (error || !data) return false;
    return data.value === 'true';
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Buat transaksi QRIS baru
// (previously: api/premium/create-transaction.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Endpoint pembuatan transaksi pembayaran ini sebelumnya TIDAK punya
  // rate limit sama sekali -- endpoint sensitif (memicu transaksi QRIS)
  // seharusnya dibatasi ketat per user untuk cegah spam/abuse percobaan
  // pembayaran berulang.
  const allowed = await enforceRateLimit(supabase, res, `payment:create:${user.id}`, 5, 60);
  if (!allowed) return;

  const { data: existing } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', user.id)
    .single();
  if (existing?.is_premium) return res.status(400).json({ error: 'ALREADY_PREMIUM' });

  const { voucherId } = req.body;
  let discountPercent = 0;

  if (voucherId) {
    const { data: voucher } = await supabase
      .from('premium_vouchers')
      .select('*')
      .eq('id', voucherId)
      .eq('is_active', true)
      .is('revoked_at', null)
      .single();

    if (voucher) {
      discountPercent = voucher.discount_percent;
    }
  }

  // Fetch global premium base price from app_settings
  const { data: settingData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'premium_base_price')
    .single();
  const baseAmount = Number(settingData?.value ?? 20000);

  const discountAmount = Math.floor((baseAmount * discountPercent) / 100);
  const finalAmount = baseAmount - discountAmount;
  const orderId = `PREMIUM-${user.id.slice(0, 8)}-${Date.now()}`;
  const expiredAt = new Date(Date.now() + EXPIRY_SECONDS * 1000).toISOString();

  // --- Dummy QRIS mode ---
  if (await isDummyQrisEnabled()) {
    const totalAmount = finalAmount + randomUniqueCode();
    const qrisUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
      `DUMMY-QRIS|${orderId}|${totalAmount}`
    )}`;

    const { error: insertError } = await supabase.from('premium_transactions').insert({
      user_id: user.id,
      order_id: orderId,
      amount: baseAmount,
      total_amount: totalAmount,
      status: 'PENDING',
      qris_url: qrisUrl,
      direct_url: null,
      signature: null,
      is_sandbox: true,
      expired_at: expiredAt,
      voucher_id: voucherId || null,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      final_amount: finalAmount,
    });

    if (insertError) {
      console.error('dummy create-transaction insert error', insertError);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }

    return res.status(200).json({
      data: {
        order_id: orderId,
        amount: baseAmount,
        total_amount: totalAmount,
        qris_url: qrisUrl,
        expired_at: expiredAt,
        status: 'PENDING',
        voucher_id: voucherId || null,
        is_sandbox: true,
      },
    });
  }

  // --- Transaksi KlikQRIS asli ---
  try {
    const klikRes = await fetch('https://klikqris.com/api/qrisv2/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.KLIKQRIS_API_KEY!,
        'id_merchant': process.env.KLIKQRIS_MERCHANT_ID!,
      },
      body: JSON.stringify({
        order_id: orderId,
        id_merchant: process.env.KLIKQRIS_MERCHANT_ID,
        amount: finalAmount,
        keterangan: 'E-Wallet Kita - Premium Lifetime',
      }),
    });
    const klikJson = await klikRes.json();
    if (!klikJson?.status || !klikJson?.data) {
      return res.status(502).json({ error: 'KLIKQRIS_CREATE_FAILED' });
    }

    const d = klikJson.data;

    await supabase.from('premium_transactions').insert({
      user_id: user.id,
      order_id: orderId,
      amount: baseAmount,
      total_amount: Math.round(parseFloat(d.total_amount)),
      status: 'PENDING',
      qris_url: d.qris_url,
      direct_url: d.direct_url,
      signature: d.signature,
      is_sandbox: false,
      expired_at: expiredAt,
      voucher_id: voucherId || null,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      final_amount: finalAmount,
    });

    return res.status(200).json({
      data: {
        order_id: orderId,
        amount: baseAmount,
        total_amount: Math.round(parseFloat(d.total_amount)),
        qris_url: d.qris_url,
        expired_at: expiredAt,
        status: 'PENDING',
        voucher_id: voucherId || null,
        is_sandbox: false,
      },
    });
  } catch (e: any) {
    console.error('create-transaction error', e);
    await logError(supabase, {
      source: "premium/payment:create",
      level: "error",
      message: e?.message ? String(e.message) : "Gagal membuat transaksi premium",
      userId: user?.id ?? null,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — Cek status pembayaran
// (previously: api/premium/status.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function handleStatus(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Surrogate-Control', 'no-store');

  const user = await getUserFromAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Status-check di-poll berkali-kali secara wajar oleh UI selama proses
  // pembayaran, jadi limit-nya lebih longgar daripada handleCreate --
  // tetap ada supaya tidak bisa dijadikan endpoint untuk polling agresif.
  const allowedStatus = await enforceRateLimit(supabase, res, `payment:status:${user.id}`, 30, 60);
  if (!allowedStatus) return;

  const orderId = req.query.order_id as string;
  if (!orderId) return res.status(400).json({ error: 'order_id required' });

  const { data: localTx } = await supabase
    .from('premium_transactions')
    .select('*, premium_vouchers(*)')
    .eq('order_id', orderId)
    .eq('user_id', user.id)
    .single();
  if (!localTx) return res.status(404).json({ error: 'NOT_FOUND' });

  const response = {
    status: localTx.status,
    voucher_id: localTx.voucher_id,
    discount_percent: localTx.discount_percent,
    final_amount: localTx.final_amount,
  };

  // Local 90s expiry check
  if (localTx.status === 'PENDING' && new Date(localTx.expired_at).getTime() < Date.now()) {
    await supabase
      .from('premium_transactions')
      .update({ status: 'EXPIRED' })
      .eq('order_id', orderId);
    return res.status(200).json({ ...response, status: 'EXPIRED' });
  }

  if (localTx.status !== 'PENDING') {
    return res.status(200).json(response);
  }

  // --- Dummy QRIS mode ---
  // Selesaikan sendiri di sini; jangan pernah panggil API KlikQRIS asli
  // untuk transaksi sandbox. Dicek dari flag pada baris transaksi itu
  // sendiri (bukan membaca ulang setting dummy_qris_enabled) supaya tetap
  // konsisten walau admin sudah menonaktifkan toggle-nya setelah transaksi
  // ini dibuat.
  if (localTx.is_sandbox) {
    const DUMMY_AUTO_SUCCESS_DELAY_MS = 8000;
    const ageMs = Date.now() - new Date(localTx.created_at).getTime();

    if (ageMs >= DUMMY_AUTO_SUCCESS_DELAY_MS) {
      await supabase
        .from('premium_transactions')
        .update({ status: 'SUCCESS', paid_at: new Date().toISOString() })
        .eq('order_id', orderId);
      await supabase
        .from('users')
        .update({ is_premium: true, premium_paid_at: new Date().toISOString() })
        .eq('id', user.id);
      return res.status(200).json({ status: 'SUCCESS' });
    }
    return res.status(200).json({ status: 'PENDING' });
  }

  // --- KlikQRIS status check ---
  try {
    const klikRes = await fetch(
      `https://klikqris.com/api/qrisv2/status/${process.env.KLIKQRIS_MERCHANT_ID}/${orderId}`,
      {
        headers: {
          'x-api-key': process.env.KLIKQRIS_API_KEY!,
          'id_merchant': process.env.KLIKQRIS_MERCHANT_ID!,
        },
      }
    );
    const klikJson = await klikRes.json();
    const remoteStatus = klikJson?.data?.status;

    if (remoteStatus === 'SUCCESS') {
      await supabase
        .from('premium_transactions')
        .update({ status: 'SUCCESS', paid_at: new Date().toISOString() })
        .eq('order_id', orderId);
      await supabase
        .from('users')
        .update({ is_premium: true, premium_paid_at: new Date().toISOString() })
        .eq('id', user.id);
      return res.status(200).json({ status: 'SUCCESS' });
    }
    if (remoteStatus === 'EXPIRED') {
      await supabase
        .from('premium_transactions')
        .update({ status: 'EXPIRED' })
        .eq('order_id', orderId);
      return res.status(200).json({ status: 'EXPIRED' });
    }
    return res.status(200).json({ status: 'PENDING' });
  } catch (e: any) {
    console.error('status check error', e);
    await logError(supabase, {
      source: "premium/payment:status",
      level: "warning",
      message: e?.message ? String(e.message) : "Gagal cek status pembayaran (fail-soft, tetap polling)",
      userId: user?.id ?? null,
    });
    return res.status(200).json({ status: 'PENDING' }); // fail-soft, keep polling
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT — Terima webhook dari KlikQRIS
// (previously: api/premium/webhook.ts)
// ─────────────────────────────────────────────────────────────────────────────
async function handleWebhook(req: VercelRequest, res: VercelResponse) {
  try {
    const payload = req.body?.data;
    if (!payload?.order_id || !payload?.signature) {
      res.status(200).json({ received: true }); // ack 200 walau payload aneh
      return;
    }

    // Satu round-trip atomic: cek signature + idempotency + update tx/user
    // semuanya dalam satu transaksi Postgres yang mengunci baris (FOR UPDATE).
    // Ini menutup race condition antar webhook delivery yang nyaris
    // bersamaan, dan meminimalkan risiko response lambat/timeout karena
    // hanya 1 network round-trip ke DB, bukan 3 berurutan.
    const { data, error } = await supabase.rpc('process_klikqris_webhook', {
      p_order_id: payload.order_id,
      p_signature: payload.signature,
      p_status: payload.status ?? null,
    });

    if (error) {
      console.error('process_klikqris_webhook rpc error', error);
      await logError(supabase, {
        source: 'premium/payment:webhook',
        level: 'error',
        message: error.message || 'RPC process_klikqris_webhook gagal',
        context: { order_id: payload.order_id },
      });
      res.status(200).json({ received: true });
      return;
    }

    const outcome = data?.[0]?.outcome;
    if (outcome === 'SIGNATURE_MISMATCH') {
      console.warn('Webhook signature mismatch, ignoring', payload.order_id);
    } else if (outcome === 'NOT_FOUND') {
      console.warn('Webhook for unknown order_id, ignoring', payload.order_id);
    }

    res.status(200).json({ received: true });
  } catch (e: any) {
    console.error('webhook error', e);
    await logError(supabase, {
      source: "premium/payment:webhook",
      level: "error",
      message: e?.message ? String(e.message)
        : "Webhook KlikQRIS gagal diproses tapi tetap dibalas 200 (lihat context untuk order_id) — cek manual apakah status premium user perlu dikoreksi.",
      context: { order_id: (req.body as any)?.data?.order_id ?? null },
    });
    res.status(200).json({ received: true }); // KlikQRIS butuh 200 walau ada error internal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation — jaring pengaman untuk webhook yang hilang/gagal
// (previously: tidak ada — ini bagian baru)
//
// PUT /payment (webhook) SENGAJA selalu balas 200 ke KlikQRIS walau ada
// error internal, supaya KlikQRIS tidak infinite-retry ke endpoint yang
// error terus. Konsekuensinya: kalau proses di dalam webhook gagal
// (network blip ke Supabase, dsb), TIDAK ADA retry otomatis dari provider.
// Fungsi ini dipicu sebagai GET oleh workflow GitHub Actions
// (.github/workflows/premium-payment-reconcile.yml), tiap 15 menit: cari
// transaksi yang masih PENDING padahal sudah dibuat lama, cek ulang status
// ASLI ke KlikQRIS, lalu selesaikan lewat RPC atomic yang sama dengan
// webhook (`process_klikqris_webhook`) supaya tetap idempotent & konsisten.
// ─────────────────────────────────────────────────────────────────────────────
const RECONCILE_STUCK_AFTER_MS = 10 * 60 * 1000; // dianggap "macet" setelah 10 menit
const RECONCILE_BATCH_SIZE = 25; // batasi per run supaya tidak melebihi maxDuration

async function handleReconcile(req: VercelRequest, res: VercelResponse) {
  const cutoff = new Date(Date.now() - RECONCILE_STUCK_AFTER_MS).toISOString();

  // Sandbox dikecualikan: transaksi dummy diselesaikan sendiri oleh
  // handleStatus (client-side polling), bukan lewat KlikQRIS asli.
  const { data: stuckTx, error: fetchError } = await supabase
    .from('premium_transactions')
    .select('order_id, signature, created_at')
    .eq('status', 'PENDING')
    .eq('is_sandbox', false)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(RECONCILE_BATCH_SIZE);

  if (fetchError) {
    await logError(supabase, {
      source: 'premium/payment:reconcile',
      level: 'error',
      message: fetchError.message || 'Gagal ambil daftar transaksi PENDING untuk reconciliation',
    });
    return res.status(200).json({ checked: 0, reconciled: 0, error: true });
  }

  let reconciled = 0;
  let stillPending = 0;
  let checkFailed = 0;

  for (const tx of stuckTx ?? []) {
    try {
      const klikRes = await fetch(
        `https://klikqris.com/api/qrisv2/status/${process.env.KLIKQRIS_MERCHANT_ID}/${tx.order_id}`,
        {
          headers: {
            'x-api-key': process.env.KLIKQRIS_API_KEY!,
            'id_merchant': process.env.KLIKQRIS_MERCHANT_ID!,
          },
        }
      );
      const klikJson = await klikRes.json();
      const remoteStatus = klikJson?.data?.status;

      if (remoteStatus === 'SUCCESS' || remoteStatus === 'EXPIRED') {
        // Signature diambil dari row itu sendiri (bukan dari luar), jadi
        // otomatis lolos pengecekan signature di dalam RPC — di sini RPC
        // dipakai untuk atomicity & idempotency-nya, bukan untuk verifikasi
        // keaslian pemanggil (itu sudah dijamin oleh CRON_SECRET di atas).
        const { error: rpcError } = await supabase.rpc('process_klikqris_webhook', {
          p_order_id: tx.order_id,
          p_signature: tx.signature,
          p_status: remoteStatus,
        });
        if (rpcError) {
          checkFailed++;
          await logError(supabase, {
            source: 'premium/payment:reconcile',
            level: 'error',
            message: rpcError.message || 'RPC gagal saat reconcile',
            context: { order_id: tx.order_id, remoteStatus },
          });
        } else {
          reconciled++;
        }
      } else {
        stillPending++;
      }
    } catch (e: any) {
      checkFailed++;
      await logError(supabase, {
        source: 'premium/payment:reconcile',
        level: 'warning',
        message: e?.message ? String(e.message) : 'Gagal cek status KlikQRIS saat reconcile',
        context: { order_id: tx.order_id },
      });
    }
  }

  // v0.77.0 Item 9: baris info "semuanya baik-baik saja" (153/173 baris
  // error_logs, ~5/hari) hanya ditulis bila ada sinyal — ada yang
  // diperbaiki, masih pending, atau gagal dicek. Run kosong (0/0/0/0)
  // tetap terlihat di respons HTTP workflow + log GitHub Actions, jadi
  // tidak ada sinyal yang hilang; Monitor Error berhenti didominasi
  // heartbeat sukses. Baris error/warning di atas TIDAK diubah.
  if (reconciled > 0 || stillPending > 0 || checkFailed > 0) {
    await logError(supabase, {
      source: 'premium/payment:reconcile',
      level: 'info',
      message: `Reconciliation selesai: ${stuckTx?.length ?? 0} dicek, ${reconciled} diperbaiki, ${stillPending} masih pending, ${checkFailed} gagal dicek.`,
      context: { checked: stuckTx?.length ?? 0, reconciled, stillPending, checkFailed },
    });
  }

  return res.status(200).json({
    checked: stuckTx?.length ?? 0,
    reconciled,
    stillPending,
    checkFailed,
  });
}
