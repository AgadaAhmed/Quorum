import { searchGifs, trendingGifs, __parseTenor } from '../lib/tenor';

const sampleResponse = {
  results: [
    { id: '1', media_formats: { tinygif: { url: 'https://t/1.gif', dims: [220, 180] }, tinygifpreview: { url: 'https://t/1.png', dims: [220, 180] } } },
    { id: '2', media_formats: { tinygif: { url: 'https://t/2.gif', dims: [200, 200] }, tinygifpreview: { url: 'https://t/2.png', dims: [200, 200] } } },
  ],
};

describe('__parseTenor', () => {
  it('maps results to {id, gifUrl, stillUrl, dims}', () => {
    expect(__parseTenor(sampleResponse)).toEqual([
      { id: '1', gifUrl: 'https://t/1.gif', stillUrl: 'https://t/1.png', dims: [220, 180] },
      { id: '2', gifUrl: 'https://t/2.gif', stillUrl: 'https://t/2.png', dims: [200, 200] },
    ]);
  });
  it('skips results missing a tinygif url', () => {
    expect(__parseTenor({ results: [{ id: 'x', media_formats: {} }] })).toEqual([]);
  });
  it('tolerates a missing results array', () => {
    expect(__parseTenor({})).toEqual([]);
  });
});

describe('searchGifs / trendingGifs', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('search always requests SFW content and passes the query', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => sampleResponse });
    global.fetch = fetchMock as any;
    const out = await searchGifs('cat', 10);
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/search');
    expect(calledUrl).toContain('contentfilter=high');
    expect(calledUrl).toContain('q=cat');
    expect(calledUrl).toContain('limit=10');
    expect(out).toHaveLength(2);
    expect(out[0].gifUrl).toBe('https://t/1.gif');
  });

  it('trending always requests SFW content', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => sampleResponse });
    global.fetch = fetchMock as any;
    await trendingGifs(12);
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/featured');
    expect(calledUrl).toContain('contentfilter=high');
    expect(calledUrl).toContain('limit=12');
  });

  it('returns [] when the request is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as any;
    expect(await searchGifs('cat')).toEqual([]);
  });
});
