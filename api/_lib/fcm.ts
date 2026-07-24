import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createClient } from '@supabase/supabase-js';
import { logError } from './errorLogger.js';

const supabaseLogger = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function ensureApp() {
  const apps = getApps();
  if (apps.length) return apps[0]!;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials not configured.');
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

// Token-token yang sudah tidak valid menurut Firebase.
// Kode ini dikenali sebagai "token sudah kadaluarsa / app di-uninstall".
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Hapus token-token invalid dari tabel user_push_tokens menggunakan
 * service-role client (bypass RLS) agar bisa delete milik user manapun.
 */
async function purgeInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    console.warn('[FCM] Cannot purge invalid tokens: service role key not configured');
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { error } = await supabase
    .from('user_push_tokens')
    .delete()
    .in('fcm_token', tokens);

  if (error) {
    console.error('[FCM] Failed to purge invalid tokens:', error.message);
  } else {
    console.log(`[FCM] Purged ${tokens.length} invalid token(s) from DB`);
  }
}

export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  ensureApp();
  try {
    await getMessaging().send({
      token: fcmToken,
      notification: { title, body },
      data: { title, body, ...(data ?? {}) },
    });
  } catch (err: any) {
    if (INVALID_TOKEN_CODES.has(err?.code)) {
      console.warn(`[FCM] Token not registered, purging: ${fcmToken.slice(0, 20)}...`);
      await purgeInvalidTokens([fcmToken]);
    }
    throw err;
  }
}

export interface BatchPushResult {
  successCount: number;
  failCount: number;
}

export async function sendPushNotificationBatch(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<BatchPushResult> {
  ensureApp();
  const response = await getMessaging().sendEachForMulticast({
    notification: { title, body },
    data: { title, body, ...(data ?? {}) },
    tokens,
  });

  if (response.failureCount > 0) {
    console.warn(`[FCM] ${response.failureCount}/${tokens.length} notifications failed`);

    // Kumpulkan token yang invalid berdasarkan error code dari Firebase
    const invalidTokens: string[] = [];
    response.responses.forEach((r, i) => {
      if (r.error) {
        console.warn('[FCM] Send error:', r.error.code, r.error.message);
        if (INVALID_TOKEN_CODES.has(r.error.code)) {
          invalidTokens.push(tokens[i]);
        }
      }
    });

    // Hapus token invalid dari DB agar broadcast berikutnya tidak mencoba lagi
    if (invalidTokens.length > 0) {
      await purgeInvalidTokens(invalidTokens);
    }
  }

  return {
    successCount: response.successCount,
    failCount: response.failureCount,
  };
}

/**
 * Kirim notifikasi push ke SEMUA device terdaftar milik satu user.
 *
 * Sejak user_push_tokens mendukung multi-device (lihat migration
 * 20260728000000_push_tokens_multi_device.sql), satu user bisa punya
 * lebih dari satu baris fcm_token. Pemanggil tidak boleh lagi pakai
 * `.maybeSingle()` + sendPushNotification(token) karena itu hanya
 * akan menjangkau satu device (dan akan error kalau ada >1 baris).
 *
 * Fungsi ini menggantikan pola itu: ambil semua token milik user,
 * lalu kirim ke semuanya sekaligus lewat multicast.
 */
export async function sendPushNotificationToUser(
  supabaseBackend: any,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<BatchPushResult> {
  const { data: rows, error } = await supabaseBackend
    .from('user_push_tokens')
    .select('fcm_token')
    .eq('user_id', userId);

  if (error) {
    console.error('[FCM] Failed to fetch push tokens for user:', error.message);
    void logError(supabaseLogger, {
      source: "fcm",
      message: error.message,
      userId,
      context: { fn: "sendPushNotificationToUser.fetchTokens" },
    });
    return { successCount: 0, failCount: 0 };
  }

  const tokens = (rows ?? [])
    .map((r: { fcm_token: string }) => r.fcm_token)
    .filter(Boolean);

  if (tokens.length === 0) return { successCount: 0, failCount: 0 };

  if (tokens.length === 1) {
    try {
      await sendPushNotification(tokens[0], title, body, data);
      return { successCount: 1, failCount: 0 };
    } catch (err) {
      void logError(supabaseLogger, {
        source: "fcm",
        message: err instanceof Error ? err.message : String(err),
        userId,
        context: { fn: "sendPushNotificationToUser.singleDevice" },
      });
      return { successCount: 0, failCount: 1 };
    }
  }
  return sendPushNotificationBatch(tokens, title, body, data);
}