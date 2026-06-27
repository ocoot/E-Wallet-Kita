import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

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
    data: { title, body, ...(data ?? {}) },
  });
}

export async function sendPushNotificationBatch(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  ensureApp();
  const response = await getMessaging().sendEachForMulticast({
    notification: { title, body },
    data: { title, body, ...(data ?? {}) },
    tokens,
  });
  if (response.failureCount > 0) {
    console.warn(`[FCM] ${response.failureCount}/${tokens.length} notifications failed`);
    for (const err of response.responses) {
      if (err.error) console.warn('[FCM] Send error:', err.error.code, err.error.message);
    }
  }
}
