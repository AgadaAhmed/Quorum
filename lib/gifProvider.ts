// Klipy GIF provider (replaced Tenor, shut down June 2026).
// SFW is NON-NEGOTIABLE: every request sends rating=g (strictest) so the
// provider only returns G-rated content.

export type GifResult = {
  id: string;
  gifUrl: string;   // animated
  stillUrl: string; // first-frame preview (rendered with autoplay=false downstream)
  dims: [number, number];
};

const BASE = 'https://api.klipy.com/api/v1';
const KEY = process.env.EXPO_PUBLIC_KLIPY_KEY ?? '';

function buildUrl(path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams({ rating: 'g', ...params }); // rating=g = SFW gate, never remove
  return `${BASE}/${KEY}/gifs${path}?${qs.toString()}`;
}

/** Tolerant: finds the first usable media under item.file|files, preferring gif
 *  then webp for the animated url, across whatever size keys exist. Also grabs a
 *  genuine static still (Klipy's per-size `jpg`) when present — rendering a real
 *  JPG is far more reliable than freezing a .gif's first frame. */
function pickMedia(item: any): { url: string; still: string; w: number; h: number } | null {
  const container = item?.file ?? item?.files ?? {};
  if (!container || typeof container !== 'object') return null;
  // Prefer common mid sizes first, then any remaining.
  const preferred = ['md', 'sm', 'hd', 'lg', 'original', 'xs'];
  const keys = [...preferred.filter((k) => container[k]), ...Object.keys(container).filter((k) => !preferred.includes(k))];
  for (const k of keys) {
    const fmt = container[k];
    if (!fmt || typeof fmt !== 'object') continue;
    const media = fmt.gif ?? fmt.webp ?? fmt;
    const url = media?.url;
    if (typeof url === 'string' && url) {
      const jpgUrl = fmt.jpg && typeof fmt.jpg.url === 'string' ? fmt.jpg.url : '';
      return { url, still: jpgUrl || url, w: Number(media.width) || 1, h: Number(media.height) || 1 };
    }
  }
  return null;
}

/** Exported for tests. Normalizes a Klipy response to GifResult[]. */
export function __parseKlipy(json: any): GifResult[] {
  if (!json || json.result === false) return [];
  const items = Array.isArray(json?.data?.data) ? json.data.data : [];
  const out: GifResult[] = [];
  for (const item of items) {
    const media = pickMedia(item);
    if (!media) continue;
    out.push({
      id: String(item.id ?? item.slug ?? media.url),
      gifUrl: media.url,
      stillUrl: media.still, // real static jpg when Klipy provides one, else the gif url (frozen downstream)
      dims: [media.w, media.h],
    });
  }
  return out;
}

async function fetchKlipy(url: string): Promise<GifResult[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return __parseKlipy(await res.json());
  } catch {
    return [];
  }
}

export function searchGifs(query: string, limit = 24): Promise<GifResult[]> {
  return fetchKlipy(buildUrl('/search', { q: query, per_page: String(limit), page: '1' }));
}

export function trendingGifs(limit = 24): Promise<GifResult[]> {
  return fetchKlipy(buildUrl('/trending', { per_page: String(limit) }));
}
