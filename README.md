# 🎵 SigalMedia Audio Engine — Tam Kurulum Kılavuzu

> Bu döküman Umut'un projeyi **sıfırdan** kurup SigalMedia'ya eksiksiz bağlaması için hazırlanmıştır.

---

## 📁 Proje Yapısı

```
sigal muzik/
├── audio-service/          ← Node.js + TypeScript mikroservis (Umut'un kuracağı)
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts      ← Çevre değişkenleri
│   │   │   ├── r2.ts       ← Cloudflare R2 bağlantısı
│   │   │   └── firebase.ts ← Firebase Admin SDK
│   │   ├── controllers/
│   │   │   └── audio.ts    ← /search ve /resolve endpoint mantığı
│   │   ├── services/
│   │   │   ├── search.ts   ← YouTube arama (yt-search)
│   │   │   ├── downloader.ts ← yt-dlp + süre kontrolü
│   │   │   └── storage.ts  ← R2 upload + Redis/Firestore cache
│   │   ├── middlewares/
│   │   │   └── auth.ts     ← x-api-key doğrulama
│   │   └── index.ts        ← Express sunucu girişi
│   ├── .env.example        ← Doldurmam gereken değişkenler
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── package.json
│
└── sigalmedia-client/      ← Tarayıcı istemcisi (Firebase bağlı)
    ├── index.html
    ├── style.css
    ├── app.js
    └── package.json
```

---

## 🚀 ADIM 1: Audio Servisi Kurulumu

### 1.1 — Sistem Bağımlılıklarını Kur

```bash
# Ubuntu / Debian (Render, Hetzner, DigitalOcean)
sudo apt-get update && sudo apt-get install -y ffmpeg python3 curl

# yt-dlp — HER ZAMAN EN GÜNCEL SÜRÜMÜ İNDİR
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp

# Doğrula
yt-dlp --version
ffmpeg -version
```

### 1.2 — Node.js Bağımlılıklarını Kur

```bash
cd audio-service
npm install
```

### 1.3 — `.env` Dosyasını Oluştur

```bash
cp .env.example .env
```

`.env` dosyasını aç ve şu alanları doldur:

| Değişken | Nereden Alınır? |
|----------|-----------------|
| `AUDIO_SERVICE_API_KEY` | İstediğin güçlü bir şifre yaz |
| `R2_ACCESS_KEY_ID` | Cloudflare Dashboard → R2 → Manage R2 API Tokens |
| `R2_SECRET_ACCESS_KEY` | Yukarıdaki token oluşturulurken gösterilir |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET_NAME` | Oluşturduğun bucket adı (örn: `sigalmedia-audio`) |
| `R2_PUBLIC_CDN` | R2 bucket'ına bağlanan custom domain veya public URL |
| `FIREBASE_PROJECT_ID` | `music-c39c2` (zaten var) |
| `FIREBASE_CLIENT_EMAIL` | Firebase Console → Proje Ayarları → Servis Hesapları → Yeni anahtar oluştur |
| `FIREBASE_PRIVATE_KEY` | Yukarıdaki JSON dosyasındaki `private_key` alanı |

### 1.4 — Geliştirme Modunda Çalıştır

```bash
npm run dev
# → http://localhost:4000
```

### 1.5 — Servisin Çalıştığını Doğrula

```bash
curl http://localhost:4000/health
# Beklenen: {"status":"OK","service":"SigalMedia Audio Engine",...}

curl -H "x-api-key: sigalmedia_super_secret_key_2024" \
  "http://localhost:4000/api/audio/search?q=Ezhel&limit=3"
```

---

## ☁️ ADIM 2: Cloudflare R2 Ayarları

### 2.1 — Bucket Oluştur

1. [dash.cloudflare.com](https://dash.cloudflare.com) → R2 → **Create bucket**
2. Bucket adı: `sigalmedia-audio`
3. **Settings → Public access → Allow public access** ✅

### 2.2 — CORS Yapılandırması (⚠️ Zorunlu)

R2 Bucket → Settings → **CORS Policy**:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

> **Neden zorunlu?** SigalMedia canvas'ı `AudioContext` ile sesi mikslerken CORS başlığı olmayan ses dosyaları "tainted" (kirlenmiş) sayılır ve dışa aktarılamaz.

### 2.3 — API Token Oluştur

R2 → **Manage R2 API Tokens** → Create API Token:
- İzinler: Object Read & Write
- Scope: Specific bucket → `sigalmedia-audio`

---

## 🔴 ADIM 3: Redis Kurulumu (Opsiyonel ama Önerilir)

```bash
# Docker ile Redis (en kolay yol)
docker run -d --name sigal-redis -p 6379:6379 redis:7-alpine

# VEYA Upstash Redis (ücretsiz, bulut tabanlı)
# → https://upstash.com → Yeni veritabanı → Redis URL'sini .env'e yaz
```

> **Not:** Redis yoksa servis yine çalışır ama önbellek tamamen Firestore'a düşer (~80ms vs ~15ms).

---

## 🐳 ADIM 4: Docker ile Deploy

```bash
cd audio-service

# Derleme
docker build -t sigalmedia-audio .

# Çalıştır
docker run -p 4000:4000 --env-file .env sigalmedia-audio

# VEYA Docker Compose (Redis dahil)
docker compose up -d
```

---

## 🔥 ADIM 5: Firebase Firestore Güvenlik Kuralları

Firebase Console → Firestore → **Rules**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Ses önbelleği — sadece Admin SDK yazabilir
    match /audioCache/{videoId} {
      allow read: if true;
      allow write: if false;
    }

    // Kullanıcı verileri — sadece kendi kullanıcısı
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 🌐 ADIM 6: İstemciyi SigalMedia'ya Bağla

`sigalmedia-client/app.js` içindeki şu satırı değiştir:

```javascript
// Geliştirme (Umut'un yerel makinesi)
const AUDIO_SERVICE_BASE = 'http://localhost:4000';

// Production (gerçek sunucu)
const AUDIO_SERVICE_BASE = 'https://audio.sigalmedia.com';
```

---

## 🛡️ 4 Kritik Tuzak ve Çözümleri

### Tuzak 1: Disk Dolması ✅ Çözüldü
`storage.ts` içinde `try...finally` bloğu her indirmeden sonra geçici dosyayı siler:
```typescript
} finally {
  await fs.promises.unlink(localPath); // R2'ye yüklenince disk temizlenir
}
```

### Tuzak 2: Uzun Videolar ✅ Çözüldü
`downloader.ts` içinde `duration > 600` kontrolü:
- 10 dakikadan uzun videolar reddedilir
- `422 Unprocessable Entity` döner

### Tuzak 3: YouTube IP Ban
```bash
# Tarayıcından cookies.txt dosyasını dışa aktar
# Chrome Extension: "Get cookies.txt LOCALLY"
# Dışa aktardığın dosyayı audio-service/ dizinine koy
cp ~/Downloads/cookies.txt ./audio-service/cookies.txt
```

### Tuzak 4: Cloudflare R2 CORS ✅ Yukarıda belgelendi

---

## 📡 API Referansı

### `GET /health`
Servis sağlık kontrolü. Auth gerektirmez.

### `GET /api/audio/search?q=...&limit=10`
**Header:** `x-api-key: <ANAHTARIN>`

```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "id": "k_h7J5X9_12",
      "title": "Ezhel - Geceler",
      "artist": "Ezhel",
      "duration": 224,
      "durationFormatted": "03:44",
      "thumbnail": "https://i.ytimg.com/vi/k_h7J5X9_12/hqdefault.jpg"
    }
  ]
}
```

### `POST /api/audio/resolve`
**Header:** `x-api-key: <ANAHTARIN>`
**Body:** `{ "videoId": "k_h7J5X9_12", "title": "Ezhel - Geceler" }`

```json
{
  "success": true,
  "fromCache": false,
  "audioUrl": "https://cdn.sigalmedia.com/audio/k_h7J5X9_12.m4a",
  "format": "m4a",
  "duration": 224
}
```

---

## ⚡ Performans Hedefleri

| İşlem | Hedef Süre |
|-------|-----------|
| Arama (yt-search) | < 500ms |
| Önbellekten çözümleme (Redis) | ~15ms |
| Önbellekten çözümleme (Firestore) | ~80ms |
| Yeni parça indirme (yt-dlp) | 2-4 saniye |
| R2 CDN yükleme | < 1 saniye |

---

## 📋 Kontrol Listesi

- [ ] `yt-dlp` ve `ffmpeg` kurulu
- [ ] `.env` dosyası dolduruldu
- [ ] Cloudflare R2 bucket oluşturuldu ve public access açık
- [ ] R2 CORS yapılandırıldı
- [ ] Firebase Firestore güvenlik kuralları ayarlandı
- [ ] Firebase Admin SDK servis hesabı anahtarı alındı
- [ ] Redis çalışıyor (opsiyonel)
- [ ] `npm run dev` çalışıyor
- [ ] `/health` endpoint yanıt veriyor
- [ ] Arama endpoint çalışıyor
- [ ] `cookies.txt` eklendi (IP ban için)
- [ ] İstemci `AUDIO_SERVICE_BASE` URL güncellendi
