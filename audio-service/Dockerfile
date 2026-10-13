# ─── Aşama 1: Builder ────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Aşama 2: Runner ─────────────────────────────────────────────────────────
FROM node:20-slim AS runner

# Sistem bağımlılıkları: ffmpeg, python3 (yt-dlp için), curl
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# yt-dlp binary indir (her zaman güncel sürüm)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

# Geçici ses dosyaları için dizin
RUN mkdir -p /tmp/sigal-audio && chmod 777 /tmp/sigal-audio

WORKDIR /app

# Sadece production bağımlılıklarını kopyala
COPY package*.json ./
RUN npm ci --omit=dev

# Build çıktısını kopyala
COPY --from=builder /app/dist ./dist

# Servis portu
EXPOSE 4000

# Sağlık kontrolü
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
