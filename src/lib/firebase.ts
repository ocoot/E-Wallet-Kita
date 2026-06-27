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
 * Returns null if permission denied or Firebase not configured.
 *
 * Firebase SDK tries to register firebase-messaging-sw.js internally, which
 * can timeout (10s) in Vite dev mode. We pre-register it ourselves and pass
 * the registration to getToken() so Firebase doesn't have to wait.
 */
export const requestFcmToken = async (): Promise<string | null> => {
  const m = getOrInitMessaging();
  if (!m) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
    if (!vapidKey) {
      console.warn('[FCM] VAPID key not set — cannot get push token');
      return null;
    }

    // Pre-register the FCM service worker so Firebase doesn't have to wait
    // for its own 10-second registration timeout.
    let swRegistration: ServiceWorkerRegistration | undefined;
    try {
      swRegistration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        { scope: '/' }
      );
      console.log('[FCM] Service worker registered successfully');
    } catch (swErr) {
      console.warn('[FCM] Could not pre-register SW, falling back to default:', swErr);
    }

    const currentToken = await getToken(m, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });
    return currentToken || null;
  } catch (err) {
    console.error('[FCM] Error getting token:', err);
    return null;
  }
};

/**
 * Save the FCM token to Supabase so the backend can send push notifications.
 * Uses upsert so calling it multiple times is safe.
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
      { onConflict: "user_id" }
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
