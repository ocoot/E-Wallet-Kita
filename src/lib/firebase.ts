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
let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

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

/**
 * Explicitly register firebase-messaging-sw.js, and reuse the SAME
 * registration object on every call instead of letting Firebase's
 * getToken() auto-discover it.
 *
 * ROOT CAUSE this fixes: this app also runs a Workbox-generated `sw.js`
 * (vite-plugin-pwa, registerType: 'autoUpdate') registered at the same
 * root scope ('/'). Auto-update means Workbox re-registers/activates a
 * new sw.js on every deploy (and sometimes every reload, depending on
 * browser SW update checks). When Firebase's getToken() was left to
 * auto-discover firebase-messaging-sw.js (no explicit registration
 * passed in), it could resolve a registration that Workbox had just
 * superseded at that scope, which made the browser's underlying push
 * subscription unstable — producing a NEW FCM token on practically
 * every page reload instead of returning the cached one. That showed up
 * as multiple rows piling up in user_push_tokens for the same browser.
 *
 * Explicitly registering this service worker ourselves (idempotent —
 * calling register() with the same script URL/scope again just returns
 * the existing registration if nothing changed) and passing it directly
 * to getToken()/deleteToken() via { serviceWorkerRegistration } removes
 * the ambiguity: Firebase always operates on the exact registration we
 * resolved, regardless of what Workbox is doing at the same scope.
 */
function getFcmServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistrationPromise) return swRegistrationPromise;

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  swRegistrationPromise = navigator.serviceWorker
    .register('/firebase-messaging-sw.js', { scope: '/firebase-cloud-messaging-push-scope/' })
    .catch((err) => {
      console.error('[FCM] Failed to register firebase-messaging-sw.js:', err);
      return null;
    });

  return swRegistrationPromise;
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

    const swRegistration = await getFcmServiceWorkerRegistration();
    const currentToken = await getToken(m, {
      vapidKey,
      ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
    });
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

  try {
    let currentToken: string | null = null;

    if (m) {
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
      const swRegistration = await getFcmServiceWorkerRegistration();
      // Resolve the exact token tied to THIS device's registration before
      // revoking it, so we delete only this device's row — not every
      // device this user is logged into. This is now reliable because
      // getFcmServiceWorkerRegistration() always resolves the same SW
      // registration (see its comment above), so getToken() returns the
      // same cached token that was originally saved to the DB, instead of
      // potentially churning to a new one.
      currentToken = cachedToken ?? (vapidKey
        ? await getToken(m, {
            vapidKey,
            ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
          }).catch(() => null)
        : null);

      await deleteToken(m).catch((err) => {
        // Non-fatal: even if the SDK-side revoke fails (e.g. no active
        // registration), we still want to remove the DB row below.
        console.warn('[FCM] deleteToken() failed, continuing with DB cleanup:', err);
      });
    }
    cachedToken = null;

    if (userId && currentToken) {
      // Scoped to this device's exact token — leaves other devices'
      // rows (and therefore their push notifications) untouched.
      await supabaseClient
        .from('user_push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('fcm_token', currentToken);
    } else if (userId) {
      // Fallback: we couldn't resolve which token belonged to this
      // device (e.g. permission was never granted this session, or SW
      // registration failed). Nothing to safely target — do NOT wipe
      // every device for this user, since that would log other devices
      // out of push too. Just log it; the row, if any, will eventually
      // be purged as an invalid token next time a push is attempted.
      console.warn('[FCM] Could not resolve this device\'s token on logout; skipping DB cleanup for it.');
    }
  } catch (err) {
    // Non-fatal: logout must still proceed even if token cleanup fails.
    console.error('[FCM] Error clearing token on logout:', err);
  }
};
