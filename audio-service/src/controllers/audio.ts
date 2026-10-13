import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { searchYouTube } from '../services/search';
import { downloadAudio } from '../services/downloader';
import { getCachedUrl, uploadAudio, cacheAudioUrl, LOCAL_AUDIO_DIR } from '../services/storage';

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/audio/search?q=Ezhel+Geceler&limit=10
// ──────────────────────────────────────────────────────────────────────────────

export async function handleSearch(req: Request, res: Response): Promise<void> {
  const query = (req.query.q as string | undefined)?.trim();
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 50);

  if (!query || query.length < 2) {
    res.status(400).json({
      success: false,
      error: 'Arama sorgusu en az 2 karakter olmalıdır. (?q=...)',
    });
    return;
  }

  try {
    const results = await searchYouTube(query, limit);
    res.json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (err: any) {
    console.error('[Search] Hata:', err.message);
    res.status(500).json({
      success: false,
      error: 'YouTube arama başarısız.',
      detail: err.message,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/audio/resolve
// Body: { videoId: "k_h7J5X9_12", title: "Ezhel - Geceler" }
// ──────────────────────────────────────────────────────────────────────────────

export async function handleResolve(req: Request, res: Response): Promise<void> {
  const { videoId, title } = req.body as { videoId?: string; title?: string };

  if (!videoId || typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({
      success: false,
      error: 'Geçerli bir YouTube video ID\'si gereklidir. (11 karakter)',
    });
    return;
  }

  try {
    // ── Adım 1: Cache kontrolü (Redis → Firestore) ───────────────────────────
    const cached = await getCachedUrl(videoId);
    if (cached) {
      // Yerel URL ise tam adres yap (R2 yokken /audio/xxx.m4a gelir)
      const absoluteCached = cached.startsWith('/') 
        ? `${req.protocol}://${req.get('host')}${cached}`
        : cached;
      res.json({
        success: true,
        fromCache: true,
        audioUrl: absoluteCached,
        format: 'm4a',
      });
      return;
    }

    // ── Adım 2: yt-dlp ile indir ─────────────────────────────────────────────
    console.log(`[Resolve] İndiriliyor: ${videoId} — "${title ?? 'başlıksız'}"`);
    const downloaded = await downloadAudio(videoId);

    // ── Adım 3: Depola (R2 veya yerel disk) ─────────────────────────────────
    const audioUrl = await uploadAudio(downloaded.filePath, videoId);

    // ── Adım 4: Cache'e kaydet ────────────────────────────────────────────────
    await cacheAudioUrl(videoId, audioUrl, title ?? videoId, downloaded.duration);

    // Yerel URL (/audio/xxx.m4a) → tam adres (http://localhost:4000/audio/xxx.m4a)
    const absoluteUrl = audioUrl.startsWith('/')
      ? `${req.protocol}://${req.get('host')}${audioUrl}`
      : audioUrl;

    res.json({
      success: true,
      fromCache: false,
      audioUrl: absoluteUrl,
      format: downloaded.format,
      duration: downloaded.duration,
    });
  } catch (err: any) {
    console.error('[Resolve] Hata:', err.message);

    // Tuzak 2: Süre aşımı
    if (err.message?.includes('dakikadan uzun')) {
      res.status(422).json({
        success: false,
        error: err.message,
      });
      return;
    }

    // Tuzak 3: YouTube bot engeli
    if (err.message?.includes('bot') || err.message?.includes('cookies')) {
      res.status(503).json({
        success: false,
        error: 'YouTube bot engeli. Lütfen cookies.txt dosyasını güncelle.',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Ses çözümleme başarısız.',
      detail: err.message,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/music?q={şarkı_adı}
// Arkadaşının istediği sade JSON formatı
// ──────────────────────────────────────────────────────────────────────────────

export async function handleMusicSearch(req: Request, res: Response): Promise<void> {
  const query = (req.query.q as string | undefined)?.trim();

  // 1. Eksik parametre kontrolü
  if (!query || query.length === 0) {
    res.status(400).json({
      error: 'Arama sorgusu parametresi "q" zorunludur. Örnek: /api/music?q=testme',
    });
    return;
  }

  try {
    // 2. YouTube araması
    const results = await searchYouTube(query, 20);

    // 3. İstenilen tam formatta JSON dizisi oluşturma
    const formatted = results.map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      duration: item.durationFormatted,
      thumbnail: item.thumbnail,
      streamUrl: `/resolve?id=${item.id}`,
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error('[MusicSearch] Hata:', err.message);
    res.status(500).json({
      error: 'Arama sırasında bir sunucu hatası oluştu.',
      detail: err.message,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /resolve?id={video_id}
// streamUrl çağrıldığında doğrudan ses akışı / indirme
// ──────────────────────────────────────────────────────────────────────────────

export async function handleStreamResolve(req: Request, res: Response): Promise<void> {
  const videoId = (req.query.id as string | undefined)?.trim();

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({
      error: 'Geçerli bir YouTube video "id" parametresi gereklidir. (11 karakter)',
    });
    return;
  }

  try {
    // 1. Önbellek kontrolü
    let audioUrl = await getCachedUrl(videoId);

    // 2. Önbellekte yoksa indir ve depola
    if (!audioUrl) {
      console.log(`[StreamResolve] İndiriliyor: ${videoId}`);
      const downloaded = await downloadAudio(videoId);
      audioUrl = await uploadAudio(downloaded.filePath, videoId);
      await cacheAudioUrl(videoId, audioUrl, videoId, downloaded.duration);
    }

    // JSON talep edildiyse JSON dön
    if (req.headers.accept?.includes('application/json') || req.query.json === 'true') {
      const absoluteUrl = audioUrl.startsWith('/')
        ? `${req.protocol}://${req.get('host')}${audioUrl}`
        : audioUrl;
      res.json({
        success: true,
        id: videoId,
        audioUrl: absoluteUrl,
        format: 'm4a',
      });
      return;
    }

    // Yerel dosya modu: Doğrudan ses akışı (HTML5 <audio src="..."> ve Range destekli)
    const localFile = path.join(LOCAL_AUDIO_DIR, `${videoId}.m4a`);
    if (fs.existsSync(localFile)) {
      res.setHeader('Content-Type', 'audio/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.sendFile(localFile);
      return;
    }

    // CDN / R2 modu ise yönlendir
    res.redirect(audioUrl);
  } catch (err: any) {
    console.error('[StreamResolve] Hata:', err.message);

    if (err.message?.includes('dakikadan uzun')) {
      res.status(422).json({ error: err.message });
      return;
    }

    res.status(500).json({
      error: 'Ses akışı çözümlenemedi.',
      detail: err.message,
    });
  }
}
