import { initializeApp, FirebaseApp } from 'firebase/app';
import { getMessaging, Messaging, getToken, onMessage } from 'firebase/messaging';

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

/**
 * Request notification permission and get FCM token.
 */
export const requestFcmToken = async (): Promise<string | null> => {
  const m = getOrInitMessaging();
  if (!m) return null;

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
    return currentToken || null;
  } catch (err) {
    console.error('[FCM] Error getting token:', err);
    return null;
  }
};

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
