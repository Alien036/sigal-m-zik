import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ENV } from '../config/env';

export interface DownloadResult {
  filePath: string;
  duration: number;
  format: string;
}

/**
 * yt-dlp ile YouTube videosunu sadece ses olarak indirir.
 *
 * Tuzak 1 çözümü: dosya /tmp'ye indirilir, R2'ye yüklendikten sonra silinir.
 * Tuzak 2 çözümü: duration > MAX_DURATION_SECONDS ise hata fırlatır.
 * Tuzak 3 çözümü: --cookies, -f "ba[ext=m4a]..." format kısıtlaması.
 *
 * @param videoId  YouTube video ID
 */
export async function downloadAudio(videoId: string): Promise<DownloadResult> {
  // Geçici klasörü oluştur
  if (!fs.existsSync(ENV.TEMP_DIR)) {
    fs.mkdirSync(ENV.TEMP_DIR, { recursive: true });
  }

  // Önce metadata al — süre kontrolü (Tuzak 2)
  const duration = await getVideoDuration(videoId);
  if (duration > ENV.MAX_DURATION_SECONDS) {
    throw new Error(`Parça ${Math.round(duration / 60)} dakikadan uzun olamaz. (Maks: ${ENV.MAX_DURATION_SECONDS / 60} dk)`);
  }

  // İndirme hedefi
  const outputPath = path.join(ENV.TEMP_DIR, `${videoId}.m4a`);

  // yt-dlp argümanları (Tuzak 3: format kısıtı + cookies)
  const cookiesPath = path.resolve(process.cwd(), 'cookies.txt');
  const cookiesArg = fs.existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [];
  const ffmpegArg = ENV.FFMPEG_DIR ? ['--ffmpeg-location', ENV.FFMPEG_DIR] : [];

  const ytdlpArgs = [
    ...cookiesArg,
    ...ffmpegArg,
    '--extractor-args', 'youtube:player_client=visionos',
    '--js-runtimes', 'node',
    '-f', '140/ba[ext=m4a]/ba',
    '--audio-quality', '128K',
    '--no-playlist',
    '--no-warnings',
    '-o', outputPath,
    `https://www.youtube.com/watch?v=${videoId}`,
  ];

  await runProcess(ENV.YTDLP_PATH, ytdlpArgs);

  // Dosyanın varlığını doğrula
  if (!fs.existsSync(outputPath)) {
    throw new Error(`İndirme başarısız: ${outputPath} bulunamadı.`);
  }

  return {
    filePath: outputPath,
    duration,
    format: 'm4a',
  };
}

/**
 * yt-dlp --print duration_string ile video süresini alır.
 * Gerçek indirme yapmaz, çok hızlıdır (~300ms).
 */
async function getVideoDuration(videoId: string): Promise<number> {
  const cookiesPath = path.resolve(process.cwd(), 'cookies.txt');
  const cookiesArg = fs.existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [];
  const ffmpegArg = ENV.FFMPEG_DIR ? ['--ffmpeg-location', ENV.FFMPEG_DIR] : [];

  const args = [
    ...cookiesArg,
    ...ffmpegArg,
    '--extractor-args', 'youtube:player_client=visionos',
    '--js-runtimes', 'node',
    '--no-warnings',
    '--print', 'duration',
    `https://www.youtube.com/watch?v=${videoId}`,
  ];

  return new Promise((resolve, reject) => {
    let stdout = '';
    const proc = spawn(ENV.YTDLP_PATH, args);

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => {
      // "Sign in to confirm" → bot engeli
      if (data.toString().includes('Sign in to confirm')) {
        reject(new Error('YouTube bot engeli. cookies.txt dosyasını güncelle.'));
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp duration sorgusu başarısız (exit ${code})`));
        return;
      }
      const seconds = parseInt(stdout.trim(), 10);
      resolve(isNaN(seconds) ? 0 : seconds);
    });

    proc.on('error', (err) => reject(new Error(`yt-dlp bulunamadı: ${err.message}. Sistem PATH'ini kontrol et.`)));
  });
}

/**
 * child_process.spawn'ı Promise'e sarar.
 */
function runProcess(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Proses başarısız (exit ${code}): ${stderr.slice(0, 500)}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}
