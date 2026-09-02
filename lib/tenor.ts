// Minimal Tenor v2 client. SFW is NON-NEGOTIABLE: every request sends
// contentfilter=high so the provider only returns G-rated content.

export type TenorResult = {
  id: string;
  gifUrl: string;   // animated (tinygif)
  stillUrl: string; // static preview (tinygifpreview)
  dims: [number, number];
};

const BASE = 'https://tenor.googleapis.com/v2';
const KEY = process.env.EXPO_PUBLIC_TENOR_KEY ?? '';

function buildUrl(path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams({
    key: KEY,
    contentfilter: 'high', // SFW gate — never remove
    media_filter: 'tinygif,tinygifpreview',
    ...params,
  });
  return `${BASE}${path}?${qs.toString()}`;
}

/** Exported for tests. Normalizes a Tenor response to TenorResult[]. */
export function __parseTenor(json: any): TenorResult[] {
  const results = Array.isArray(json?.results) ? json.results : [];
  const out: TenorResult[] = [];
  for (const r of results) {
    const gif = r?.media_formats?.tinygif;
    const still = r?.media_formats?.tinygifpreview;
    if (!gif?.url) continue;
    out.push({
      id: String(r.id ?? gif.url),
      gifUrl: gif.url,
      stillUrl: still?.url ?? gif.url,
      dims: Array.isArray(gif.dims) ? [gif.dims[0], gif.dims[1]] : [1, 1],
    });
  }
  return out;
}

async function fetchTenor(url: string): Promise<TenorResult[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return __parseTenor(await res.json());
  } catch {
    return [];
  }
}

export function searchGifs(query: string, limit = 24): Promise<TenorResult[]> {
  return fetchTenor(buildUrl('/search', { q: query, limit: String(limit) }));
}

export function trendingGifs(limit = 24): Promise<TenorResult[]> {
  return fetchTenor(buildUrl('/featured', { limit: String(limit) }));
}
