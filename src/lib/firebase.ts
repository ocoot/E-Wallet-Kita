import { initializeApp, FirebaseApp } from 'firebase/app';
import { getMessaging, Messaging, getToken, deleteToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

function isConfigured(): boolean {
  return !!firebaseConfig.apiKey && !!firebaseConfig.projectId;
}

function getOrInitMessaging(): Messaging | null {
  if (messaging) return messaging;
  if (!isConfigured()) return null;
  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    return messaging;
  } catch {
    return null;
  }
}

// In-memory cache for the current session — avoids calling getToken()
// repeatedly (e.g. every time the `user` effect in App.tsx re-runs after
// a profile refetch) when we already resolved a token this session.
let cachedToken: string | null = null;

/**
 * Request notification permission and get FCM token.
 *
 * Browsers already remember the user's permission choice across calls
 * (calling requestPermission() again when already 'granted' or 'denied'
 * just resolves immediately without prompting), but we still short-circuit
 * explicitly on 'denied' so we don't even attempt the round-trip to
 * getToken(), and we cache the resolved token in-memory so repeated calls
 * within the same page session (e.g. re-running on every auth state
 * change) don't keep re-requesting it from Firebase.
 */
export const requestFcmToken = async (): Promise<string | null> => {
  if (cachedToken) return cachedToken;

  const m = getOrInitMessaging();
  if (!m) return null;

  if (typeof Notification === 'undefined') return null;

  // Don't even prompt again if the user already explicitly denied —
  // requestPermission() would resolve to 'denied' anyway without showing
  // a prompt, but this avoids the unnecessary async round-trip.
  if (Notification.permission === 'denied') return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
    if (!vapidKey) {
      console.warn('[FCM] VAPID key not set');
      return null;
    }

    // Get the FCM token. Firebase will look for firebase-messaging-sw.js
    // first; if it fails, it falls back to the active SW.
    const currentToken = await getToken(m, { vapidKey });
    cachedToken = currentToken || null;
    return cachedToken;
  } catch (err) {
    console.error('[FCM] Error getting token:', err);
    return null;
  }
};

/**
 * Deteksi label device/browser singkat dari User-Agent, untuk kolom
 * device_info (mis. "Android Chrome", "iOS Safari", "Windows Chrome").
 * Hanya untuk tujuan tampilan/debug di admin — bukan fingerprinting,
 * tidak disimpan selain label kasar ini.
 */
function detectDeviceInfo(): string {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;

  let os = 'Unknown OS';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  return `${os} ${browser}`;
}

/**
 * Save the FCM token to Supabase so the backend can send push notifications.
 * Uses upsert so calling it multiple times is safe.
 *
 * IMPORTANT: conflict target is (user_id, fcm_token) — NOT just user_id.
 * Each device/browser has its own FCM token, so this lets a single user
 * register push notifications from multiple devices at once. Using
 * "user_id" alone here would overwrite the previous device's row every
 * time a new device registers, leaving only the most recently logged-in
 * device able to receive push notifications.
 */
export const saveFcmToken = async (
  supabaseClient: any,
  userId: string,
  token: string
): Promise<void> => {
  try {
    await supabaseClient.from("user_push_tokens").upsert(
      {
        user_id: userId,
        fcm_token: token,
        device_info: detectDeviceInfo(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,fcm_token" }
    );
  } catch (err) {
    console.error("[FCM] Error saving token to DB:", err);
  }
};

/**
 * Listen for foreground messages (app is open / in focus).
 * Returns an unsubscribe function.
 */
export const onForegroundFcmMessage = (
  callback: (payload: { title?: string; body?: string }) => void
): (() => void) => {
  const m = getOrInitMessaging();
  if (!m) return () => {};

  return onMessage(m, (payload) => {
    const title = payload.notification?.title || payload.data?.title || '';
    const body = payload.notification?.body || payload.data?.body || '';
    callback({ title, body });
  });
};

/**
 * Revoke this browser's FCM token and remove its row from Supabase.
 *
 * IMPORTANT — call this on logout. FCM web tokens are tied to the
 * browser/app instance, NOT to the logged-in account: if user A logs
 * out and user B logs in on the same device without cycling the
 * token, both accounts end up sharing the same fcm_token row (one
 * per user_id now that multi-device is supported), so A keeps
 * receiving B's push notifications and vice versa. Calling
 * deleteToken() invalidates the token immediately and permanently,
 * forcing a fresh token (and a fresh DB row tied to whoever logs in
 * next) on the next requestFcmToken() call.
 */
export const clearFcmToken = async (
  supabaseClient: any,
  userId: string | null | undefined
): Promise<void> => {
  const m = getOrInitMessaging();
  if (!m) return;

  try {
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
    // Fetch the current token (without prompting permission again) so we
    // know exactly which row to delete from Supabase.
    const currentToken = vapidKey ? await getToken(m, { vapidKey }).catch(() => null) : null;

    await deleteToken(m);
    cachedToken = null;

    if (currentToken && userId) {
      await supabaseClient
        .from('user_push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('fcm_token', currentToken);
    }
  } catch (err) {
    // Non-fatal: logout must still proceed even if token cleanup fails.
    console.error('[FCM] Error clearing token on logout:', err);
  }
};
