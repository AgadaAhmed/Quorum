import {
  resolveAvatarSource,
  initialsFor,
  PROFILE_COLORS,
  resolveColor,
  bioMaxFor,
  BIO_MAX,
  TAGLINE_MAX,
  accentGradient,
} from '../lib/profileCustomization';

describe('resolveAvatarSource', () => {
  it('prefers the animated gif on profile screens', () => {
    expect(
      resolveAvatarSource({ animated: true, gifUrl: 'g', stillUrl: 's', uploadUrl: 'u' })
    ).toEqual({ kind: 'image', uri: 'g', animated: true });
  });

  it('uses the still frame when not animated even if a gif exists', () => {
    expect(
      resolveAvatarSource({ animated: false, gifUrl: 'g', stillUrl: 's', uploadUrl: 'u' })
    ).toEqual({ kind: 'image', uri: 's', animated: false });
  });

  it('falls back to the uploaded avatar when there is no gif/still', () => {
    expect(resolveAvatarSource({ uploadUrl: 'u' })).toEqual({
      kind: 'image',
      uri: 'u',
      animated: false,
    });
  });

  it('falls back to the uploaded avatar on a profile screen when no gif is set', () => {
    expect(resolveAvatarSource({ animated: true, uploadUrl: 'u' })).toEqual({
      kind: 'image',
      uri: 'u',
      animated: false,
    });
  });

  it('returns initials when there is no image at all', () => {
    expect(resolveAvatarSource({})).toEqual({ kind: 'initials' });
  });
});

describe('initialsFor', () => {
  it('uppercases the first character', () => {
    expect(initialsFor('bruce')).toBe('B');
  });
  it('trims leading whitespace', () => {
    expect(initialsFor('  amina')).toBe('A');
  });
  it('defaults to U when name is empty/undefined', () => {
    expect(initialsFor('')).toBe('U');
    expect(initialsFor(undefined)).toBe('U');
  });
});

describe('profile color palette', () => {
  it('has a non-empty curated palette of {key,label,value}', () => {
    expect(PROFILE_COLORS.length).toBeGreaterThanOrEqual(6);
    for (const c of PROFILE_COLORS) {
      expect(c.key).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(c.value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
  it('has unique keys', () => {
    const keys = PROFILE_COLORS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('resolveColor returns the hex for a known key and undefined otherwise', () => {
    expect(resolveColor(PROFILE_COLORS[0].key)).toBe(PROFILE_COLORS[0].value);
    expect(resolveColor('nope')).toBeUndefined();
    expect(resolveColor(undefined)).toBeUndefined();
  });
});

describe('bio + tagline limits', () => {
  it('bioMaxFor gives the free cap to free users and the pro cap to pro', () => {
    expect(bioMaxFor(false)).toBe(BIO_MAX.free);
    expect(bioMaxFor(true)).toBe(BIO_MAX.pro);
    expect(BIO_MAX.pro).toBeGreaterThan(BIO_MAX.free);
  });
  it('TAGLINE_MAX is a small positive number', () => {
    expect(TAGLINE_MAX).toBeGreaterThan(0);
    expect(TAGLINE_MAX).toBeLessThanOrEqual(80);
  });
});

describe('accentGradient', () => {
  it('returns an accent->transparent pair from a hex', () => {
    const [a, b] = accentGradient('#1E9E52');
    expect(a.toLowerCase()).toBe('#1e9e522e');
    expect(b.toLowerCase()).toBe('#1e9e5200');
  });
});
