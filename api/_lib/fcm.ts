import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Initialize Firebase Admin once.
 * Requires env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
function ensureApp() {
  const apps = getApps();
  if (apps.length) return apps[0]!;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin credentials not configured. Set FIREBASE_PROJECT_ID, ' +
        'FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

/**
 * Send a push notification to a single FCM token.
 */
export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  ensureApp();

  await getMessaging().send({
    token: fcmToken,
    notification: { title, body },
    data: data ?? {},
  });
}

/**
 * Send push notifications to multiple recipients.
 * Silently skips failures so one bad token doesn't block the batch.
 */
export async function sendPushNotificationBatch(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  ensureApp();

  const response = await getMessaging().sendEachForMulticast({
    notification: { title, body },
    data: data ?? {},
    tokens,
  });

  if (response.failureCount > 0) {
    console.warn(
      `[FCM] ${response.failureCount}/${tokens.length} notifications failed`
    );
    for (const err of response.responses) {
      if (err.error) {
        console.warn('[FCM] Send error:', err.error.code, err.error.message);
      }
    }
  }
}
