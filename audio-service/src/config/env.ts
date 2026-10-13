import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Zorunlu değişken — yoksa sunucu başlamaz.
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`❌ Eksik çevre değişkeni: ${key}  →  .env dosyasını kontrol et.`);
  }
  return value;
}

/**
 * Opsiyonel değişken — yoksa uyarı verir, varsayılan döner.
 * R2 ve Firebase olmadan sadece /search çalışır.
 */
function optionalEnv(key: string, fallback = ''): string {
  const value = process.env[key];
  if (!value || value.startsWith('DEGISTIR')) {
    if (fallback === '') {
      console.warn(`⚠️  [Config] ${key} ayarlanmamış — ilgili özellik devre dışı.`);
    }
    return fallback;
  }
  return value;
}

// WinGet veya sistem varsayılan yt-dlp & ffmpeg tespiti
function resolveYtdlpPath(): string {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }
  const wingetPath = path.join(
    process.env.LOCALAPPDATA || 'C:\\Users\\mehme\\AppData\\Local',
    'Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe'
  );
  if (fs.existsSync(wingetPath)) {
    return wingetPath;
  }
  return 'yt-dlp';
}

function resolveFfmpegDir(): string {
  if (process.env.FFMPEG_DIR && fs.existsSync(process.env.FFMPEG_DIR)) {
    return process.env.FFMPEG_DIR;
  }
  const wingetFfmpeg = path.join(
    process.env.LOCALAPPDATA || 'C:\\Users\\mehme\\AppData\\Local',
    'Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin'
  );
  if (fs.existsSync(wingetFfmpeg)) {
    return wingetFfmpeg;
  }
  return '';
}

const ffmpegDir = resolveFfmpegDir();
if (ffmpegDir && !process.env.PATH?.includes(ffmpegDir)) {
  process.env.PATH = `${ffmpegDir};${process.env.PATH || ''}`;
}

export const ENV = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // API Güvenlik (ZORUNLU — servisi korur)
  AUDIO_SERVICE_API_KEY: requireEnv('AUDIO_SERVICE_API_KEY'),

  // Cloudflare R2 (OPSİYONEL — sadece ses indirme için)
  R2_ACCESS_KEY_ID:     optionalEnv('R2_ACCESS_KEY_ID'),
  R2_SECRET_ACCESS_KEY: optionalEnv('R2_SECRET_ACCESS_KEY'),
  R2_ENDPOINT:          optionalEnv('R2_ENDPOINT', 'https://placeholder.r2.cloudflarestorage.com'),
  R2_BUCKET_NAME:       optionalEnv('R2_BUCKET_NAME', 'sigalmedia-audio'),
  R2_PUBLIC_CDN:        optionalEnv('R2_PUBLIC_CDN', 'https://cdn.sigalmedia.com'),

  // Redis (OPSİYONEL)
  REDIS_URL:  process.env.REDIS_URL || 'redis://localhost:6379',
  CACHE_TTL:  parseInt(process.env.CACHE_TTL || '604800', 10),

  // Firebase (OPSİYONEL — Auth ve Firestore için)
  FIREBASE_PROJECT_ID:  optionalEnv('FIREBASE_PROJECT_ID', 'music-c39c2'),
  FIREBASE_CLIENT_EMAIL: optionalEnv('FIREBASE_CLIENT_EMAIL'),
  FIREBASE_PRIVATE_KEY:  optionalEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),

  // yt-dlp & ffmpeg
  MAX_DURATION_SECONDS: parseInt(process.env.MAX_DURATION_SECONDS || '600', 10),
  YTDLP_PATH: resolveYtdlpPath(),
  FFMPEG_DIR: ffmpegDir,
  TEMP_DIR:   process.env.TEMP_DIR || path.join(os.tmpdir(), 'sigal-audio'),

  // Hesaplanan özellik bayrakları
  get R2_ENABLED()       { return !!this.R2_ACCESS_KEY_ID && !!this.R2_SECRET_ACCESS_KEY; },
  get FIREBASE_ENABLED() { return !!this.FIREBASE_CLIENT_EMAIL && !!this.FIREBASE_PRIVATE_KEY; },
} as const;
