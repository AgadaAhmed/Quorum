import { resolveAvatarSource, initialsFor } from '../lib/profileCustomization';

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
