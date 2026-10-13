import { ENV } from './env';

/**
 * Firebase Admin SDK başlatma (v14+ modüler API).
 * FIREBASE_ENABLED=false ise hiç başlatılmaz, null döner.
 */

let _firestore: import('firebase-admin/firestore').Firestore | null = null;

if (ENV.FIREBASE_ENABLED) {
  // Dinamik import — kimlik bilgisi yoksa modül hiç yüklenmez
  (async () => {
    try {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');

      const app = getApps().length
        ? getApps()[0]
        : initializeApp({
            credential: cert({
              projectId:   ENV.FIREBASE_PROJECT_ID,
              clientEmail: ENV.FIREBASE_CLIENT_EMAIL,
              privateKey:  ENV.FIREBASE_PRIVATE_KEY,
            }),
          });

      _firestore = getFirestore(app);
      console.log('✅ Firebase Admin bağlantısı kuruldu.');
    } catch (err: any) {
      console.warn('⚠️  Firebase başlatılamadı (cache Firestore\'suz çalışır):', err.message);
    }
  })();
} else {
  console.warn('⚠️  [Config] Firebase devre dışı — FIREBASE_CLIENT_EMAIL ayarlanmamış.');
}

/** Firestore örneği — Firebase kapalıysa null döner. */
export function getFirestoreDb() { return _firestore; }
