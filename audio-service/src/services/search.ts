// @ts-ignore — yt-search typings eksik olabilir, suppress edildi
import ytSearch from 'yt-search';

export interface SearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;         // saniye
  durationFormatted: string; // "03:44"
  thumbnail: string;
}

/**
 * YouTube'u kazıyarak arama sonuçları döner.
 * Hiçbir API anahtarı gerektirmez.
 *
 * @param query   Arama sorgusu (örn: "Ezhel Geceler")
 * @param limit   Maksimum sonuç sayısı (varsayılan: 10)
 */
export async function searchYouTube(query: string, limit = 20): Promise<SearchResult[]> {
  const result = await ytSearch(query);

  const videos = result.videos.slice(0, Math.min(limit, 50));

  return videos.map((v: any): SearchResult => ({
    id: v.videoId,
    title: v.title,
    artist: v.author?.name ?? 'Bilinmiyor',
    duration: v.duration?.seconds ?? 0,
    durationFormatted: v.duration?.timestamp ?? '00:00',
    thumbnail: v.thumbnail ?? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
  }));
}
