import {
  titleForTime,
  titlePartForDate,
  TIME_TITLE_PARTS,
  mapGoogleTypesToCategory,
  searchPlaces,
  type Place,
} from '../lib/places';

// Mock the firebase functions callable layer.
const mockCallable = jest.fn();
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: () => mockCallable,
}));
jest.mock('../lib/firebase', () => ({ app: {}, functions: {} }));

describe('titlePartForDate', () => {
  const at = (h: number) => new Date(2026, 0, 1, h, 0, 0);
  it('maps hours to the right part', () => {
    expect(titlePartForDate(at(5))).toBe('Morning');
    expect(titlePartForDate(at(11))).toBe('Morning');
    expect(titlePartForDate(at(12))).toBe('Afternoon');
    expect(titlePartForDate(at(16))).toBe('Afternoon');
    expect(titlePartForDate(at(17))).toBe('Evening');
    expect(titlePartForDate(at(20))).toBe('Evening');
    expect(titlePartForDate(at(21))).toBe('Night');
    expect(titlePartForDate(at(23))).toBe('Night');
    expect(titlePartForDate(at(0))).toBe('Night');
    expect(titlePartForDate(at(4))).toBe('Night');
  });
});

describe('titleForTime', () => {
  it('formats "<Part> at <Venue>"', () => {
    expect(titleForTime('Villa Bar', new Date(2026, 0, 1, 21, 0))).toBe('Night at Villa Bar');
    expect(titleForTime('Cafe Neo', new Date(2026, 0, 1, 9, 0))).toBe('Morning at Cafe Neo');
  });
  it('exposes all four parts', () => {
    expect(TIME_TITLE_PARTS).toEqual(['Morning', 'Afternoon', 'Evening', 'Night']);
  });
});

describe('mapGoogleTypesToCategory', () => {
  it('maps known types to app categories', () => {
    expect(mapGoogleTypesToCategory(['bar'])).toBe('Party');
    expect(mapGoogleTypesToCategory(['night_club'])).toBe('Party');
    expect(mapGoogleTypesToCategory(['restaurant'])).toBe('Food');
    expect(mapGoogleTypesToCategory(['cafe', 'food'])).toBe('Food');
    expect(mapGoogleTypesToCategory(['gym'])).toBe('Sports');
    expect(mapGoogleTypesToCategory(['museum'])).toBe('Art');
    expect(mapGoogleTypesToCategory(['library'])).toBe('Study');
    expect(mapGoogleTypesToCategory(['park'])).toBe('Travel');
  });
  it('returns empty string for unknown/empty', () => {
    expect(mapGoogleTypesToCategory(['plumber'])).toBe('');
    expect(mapGoogleTypesToCategory([])).toBe('');
    expect(mapGoogleTypesToCategory(undefined as any)).toBe('');
  });
});

describe('searchPlaces', () => {
  beforeEach(() => mockCallable.mockReset());

  it('normalizes proxy places into Place objects with mapped category', async () => {
    mockCallable.mockResolvedValue({
      data: {
        places: [
          { placeId: 'a', name: 'Villa Bar', address: '1 St', lat: 1, lng: 2, types: ['bar'], rating: 4.3, photoRef: 'places/a/photos/x', source: 'google', featured: false },
        ],
      },
    });
    const res = await searchPlaces({ lat: 1, lng: 2 }, 'Party');
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Villa Bar');
    expect(res[0].category).toBe('Party');
    expect(res[0].photoRef).toBe('places/a/photos/x');
  });

  it('returns [] when proxy returns no places', async () => {
    mockCallable.mockResolvedValue({ data: { places: [] } });
    expect(await searchPlaces({ lat: 1, lng: 2 })).toEqual([]);
  });
});
