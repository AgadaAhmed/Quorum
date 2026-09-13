import { searchGifs, trendingGifs, __parseKlipy } from '../lib/gifProvider';

const sample = {
  result: true,
  data: {
    data: [
      { id: 1, slug: 'a', file: { md: { gif: { url: 'https://k/1.gif', width: 220, height: 180 } } } },
      { id: 2, slug: 'b', file: { md: { gif: { url: 'https://k/2.gif', width: 200, height: 200 } } } },
    ],
    current_page: 1, per_page: 24, has_next: true,
  },
};

describe('__parseKlipy', () => {
  it('maps items to {id,gifUrl,stillUrl,dims}', () => {
    expect(__parseKlipy(sample)).toEqual([
      { id: '1', gifUrl: 'https://k/1.gif', stillUrl: 'https://k/1.gif', dims: [220, 180] },
      { id: '2', gifUrl: 'https://k/2.gif', stillUrl: 'https://k/2.gif', dims: [200, 200] },
    ]);
  });
  it('tolerates the media object being named "files" and other size keys', () => {
    const alt = { result: true, data: { data: [
      { id: 3, files: { sm: { webp: { url: 'https://k/3.webp', width: 100, height: 100 } } } },
    ] } };
    expect(__parseKlipy(alt)).toEqual([
      { id: '3', gifUrl: 'https://k/3.webp', stillUrl: 'https://k/3.webp', dims: [100, 100] },
    ]);
  });
  it('uses the static jpg as stillUrl when present, gif as gifUrl', () => {
    const withJpg = { result: true, data: { data: [
      { id: 5, file: { md: {
        gif: { url: 'https://k/5.gif', width: 300, height: 200 },
        jpg: { url: 'https://k/5.jpg', width: 300, height: 200 },
      } } },
    ] } };
    expect(__parseKlipy(withJpg)).toEqual([
      { id: '5', gifUrl: 'https://k/5.gif', stillUrl: 'https://k/5.jpg', dims: [300, 200] },
    ]);
  });
  it('skips items with no usable media url', () => {
    expect(__parseKlipy({ result: true, data: { data: [{ id: 9, file: {} }] } })).toEqual([]);
  });
  it('tolerates a missing/failed envelope', () => {
    expect(__parseKlipy({})).toEqual([]);
    expect(__parseKlipy({ result: false })).toEqual([]);
  });
});

describe('searchGifs / trendingGifs', () => {
  const orig = global.fetch;
  afterEach(() => { global.fetch = orig; });

  it('search sends rating=g (SFW), the query, per_page, and hits /gifs/search', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => sample });
    global.fetch = fetchMock as any;
    const out = await searchGifs('cat', 10);
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain('/gifs/search');
    expect(url).toContain('rating=g');
    expect(url).toContain('q=cat');
    expect(url).toContain('per_page=10');
    expect(out).toHaveLength(2);
    expect(out[0].gifUrl).toBe('https://k/1.gif');
  });

  it('trending sends rating=g and hits /gifs/trending', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => sample });
    global.fetch = fetchMock as any;
    await trendingGifs(12);
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain('/gifs/trending');
    expect(url).toContain('rating=g');
    expect(url).toContain('per_page=12');
  });

  it('returns [] on a non-ok response or result:false', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as any;
    expect(await searchGifs('cat')).toEqual([]);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ result: false }) }) as any;
    expect(await searchGifs('cat')).toEqual([]);
  });
});
