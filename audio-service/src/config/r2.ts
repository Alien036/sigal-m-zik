import { S3Client } from '@aws-sdk/client-s3';
import { ENV } from './env';

/**
 * Cloudflare R2, S3 uyumlu API sunar.
 * region her zaman "auto" olmalıdır (Cloudflare kuralı).
 */
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: ENV.R2_ENDPOINT,
  credentials: {
    accessKeyId: ENV.R2_ACCESS_KEY_ID,
    secretAccessKey: ENV.R2_SECRET_ACCESS_KEY,
  },
  // R2 path-style zorunlu
  forcePathStyle: false,
});

export const R2_BUCKET = ENV.R2_BUCKET_NAME;
export const CDN_BASE  = ENV.R2_PUBLIC_CDN;
