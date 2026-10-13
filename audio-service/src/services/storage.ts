import fs from 'fs';
import path from 'path';
import { getFirestoreDb } from '../config/firebase';
import Redis from 'ioredis';
import { ENV } from '../config/env';

// ─── Redis bağlantısı ─────────────────────────────────────────────────────────
let redis: Redis | null = null;
try {
  redis = new Redis(ENV.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
  });
  redis.on('error', () => { redis = null; });
} catch {
  redis = null;
}

// ─── Bellek içi önbellek (Redis ve Firestore yokken fallback) ─────────────────
const memoryCache = new Map<string, string>();

const CACHE_PREFIX         = 'audio:youtube:';
const FIRESTORE_COLLECTION = 'audioCache';

// ─── Yerel Ses Klasörü (R2 yokken kullanılır) ─────────────────────────────────
export const LOCAL_AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

function ensureLocalDir() {
  if (!fs.existsSync(LOCAL_AUDIO_DIR)) {
    fs.mkdirSync(LOCAL_AUDIO_DIR, { recursive: true });
    console.log(`[Storage] Yerel ses klasörü oluşturuldu: ${LOCAL_AUDIO_DIR}`);
  }
}

// ─── Cache Okuma ──────────────────────────────────────────────────────────────

/**
 * Katmanlı cache: Bellek → Redis → Firestore
 * Hiçbirinde yoksa null döner.
 */
export async function getCachedUrl(videoId: string): Promise<string | null> {
  const key = `${CACHE_PREFIX}${videoId}`;

  // 0. Bellek (en hızlı — process yeniden başlayana kadar geçerli)
  if (memoryCache.has(videoId)) return memoryCache.get(videoId)!;

  // 1. Redis
  if (redis) {
    try {
      const val = await redis.get(key);
      if (val) { memoryCache.set(videoId, val); return val; }
    } catch { /* Redis erişilemez */ }
  }

  // 2. Firestore
  try {
    const db = getFirestoreDb();
    if (db) {
      const doc = await db.collection(FIRESTORE_COLLECTION).doc(videoId).get();
      if (doc.exists) {
        const data = doc.data();
        if (data?.audioUrl) {
          memoryCache.set(videoId, data.audioUrl);
          if (redis) redis.setex(key, ENV.CACHE_TTL, data.audioUrl).catch(() => {});
          return data.audioUrl as string;
        }
      }
    }
  } catch (err) {
    console.error('[Storage] Firestore okuma hatası:', err);
  }

  // 3. Yerel disk (R2 yoksa dosyalar public/audio/ klasöründe)
  if (!ENV.R2_ENABLED) {
    const localFile = path.join(LOCAL_AUDIO_DIR, `${videoId}.m4a`);
    if (fs.existsSync(localFile)) {
      const localUrl = `/audio/${videoId}.m4a`;
      memoryCache.set(videoId, localUrl);
      return localUrl;
    }
  }

  return null;
}

// ─── Yükleme / Depolama ───────────────────────────────────────────────────────

/**
 * R2 yapılandırılmışsa Cloudflare R2'ye yükler.
 * R2 yoksa dosyayı public/audio/ klasörüne taşır (yerel statik sunucu).
 *
 * Her durumda erişilebilir URL döner.
 */
export async function uploadAudio(localPath: string, videoId: string): Promise<string> {
  if (ENV.R2_ENABLED) {
    return uploadToR2(localPath, videoId);
  } else {
    return saveLocally(localPath, videoId);
  }
}

// ─── Cloudflare R2 Yükleme ───────────────────────────────────────────────────

async function uploadToR2(localPath: string, videoId: string): Promise<string> {
  // Dinamik import — R2 kimlik bilgisi olmadan SDK yüklenmez
  const { Upload }   = await import('@aws-sdk/lib-storage');
  const { r2Client, R2_BUCKET, CDN_BASE } = await import('../config/r2');

  const r2Key     = `audio/${videoId}.m4a`;
  const fileStream = fs.createReadStream(localPath);

  try {
    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket:      R2_BUCKET,
        Key:         r2Key,
        Body:        fileStream,
        ContentType: 'audio/mp4',
      },
    });
    await upload.done();
    console.log(`[Storage] R2'ye yüklendi: ${r2Key}`);
    return `${CDN_BASE}/${r2Key}`;
  } finally {
    // Tuzak 1: Geçici dosyayı her koşulda sil
    fs.promises.unlink(localPath).catch(() => {});
  }
}

// ─── Yerel Disk Depolama (R2 yokken) ─────────────────────────────────────────

async function saveLocally(localPath: string, videoId: string): Promise<string> {
  ensureLocalDir();
  const dest = path.join(LOCAL_AUDIO_DIR, `${videoId}.m4a`);

  // İndirilen dosyayı public/audio/ klasörüne taşı
  await fs.promises.rename(localPath, dest).catch(async () => {
    // rename cross-drive başarısız olabilir → kopyala + sil
    await fs.promises.copyFile(localPath, dest);
    await fs.promises.unlink(localPath).catch(() => {});
  });

  console.log(`[Storage] Yerel diske kaydedildi: ${dest}`);
  // Express static /audio/* olarak sunacak
  return `/audio/${videoId}.m4a`;
}

// ─── Cache Yazma ─────────────────────────────────────────────────────────────

/**
 * URL'yi tüm katmanlara yazar: Bellek → Redis → Firestore
 */
export async function cacheAudioUrl(
  videoId: string,
  audioUrl: string,
  title: string,
  duration: number
): Promise<void> {
  const key = `${CACHE_PREFIX}${videoId}`;

  // 0. Bellek
  memoryCache.set(videoId, audioUrl);

  // 1. Redis
  if (redis) {
    try { await redis.setex(key, ENV.CACHE_TTL, audioUrl); }
    catch (err) { console.warn('[Storage] Redis yazma hatası:', err); }
  }

  // 2. Firestore
  try {
    const db = getFirestoreDb();
    if (db) {
      await db.collection(FIRESTORE_COLLECTION).doc(videoId).set({
        videoId, audioUrl, title, duration,
        format: 'm4a',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ENV.CACHE_TTL * 1000),
      });
    }
  } catch (err) {
    console.error('[Storage] Firestore yazma hatası:', err);
  }
}
