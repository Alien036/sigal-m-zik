import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { ENV } from './config/env';
import { apiKeyAuth } from './middlewares/auth';
import { 
  handleSearch, 
  handleResolve, 
  handleMusicSearch, 
  handleStreamResolve 
} from './controllers/audio';
import { LOCAL_AUDIO_DIR } from './services/storage';

const app = express();

// ─── Güvenlik ─────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── CORS (Geliştirme portları + Üretim alan adları) ──────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
}));
app.options('*', cors());

// ─── Body Parser ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── Request Logging ──────────────────────────────────────────────────────────
app.use(morgan(ENV.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 dakika
  max: 60,               // 60 istek/dakika
  message: { success: false, error: 'Çok fazla istek. Lütfen bekleyin.' },
});

const resolveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,               // 20 istek/dakika (indirme ağır işlemdir)
  message: { success: false, error: 'Çok fazla çözümleme isteği.' },
});

// ─── Yerel Ses Dosyaları (R2 yokken statik olarak sun) ───────────────────────
// /audio/videoId.m4a → public/audio/videoId.m4a
app.use('/audio', (_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  next();
}, express.static(LOCAL_AUDIO_DIR, {
  setHeaders: (res) => {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Content-Type', 'audio/mp4');
  },
}));

// ─── Sağlık Kontrolü (auth gerekmez) ─────────────────────────────────────────
app.get('/health', (_req, res) => {

  res.json({
    status: 'OK',
    service: 'SigalMedia Audio Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── API Rotaları ─────────────────────────────────────────────────────────────
// Arkadaşının istediği yeni doğrudan arama ve stream uç noktaları
app.get('/api/music', searchLimiter, handleMusicSearch);
app.get('/resolve', resolveLimiter, handleStreamResolve);

// SigalMedia standart rotaları (auth zorunlu)
app.get('/api/audio/search', apiKeyAuth, searchLimiter, handleSearch);
app.post('/api/audio/resolve', apiKeyAuth, resolveLimiter, handleResolve);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint bulunamadı.' });
});

// ─── Global Hata Yakalayıcı ───────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Beklenmedik hata:', err);
  res.status(500).json({ success: false, error: 'Sunucu hatası.' });
});

// ─── Başlat ───────────────────────────────────────────────────────────────────
app.listen(ENV.PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║        SigalMedia Audio Engine — v1.0.0              ║
║  Ortam  : ${ENV.NODE_ENV.padEnd(42)}║
║  Port   : http://localhost:${ENV.PORT.toString().padEnd(26)}║
║  Sağlık : http://localhost:${ENV.PORT}/health          ║
╚══════════════════════════════════════════════════════╝
  `);
});

export default app;
