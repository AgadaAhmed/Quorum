// Keep the module import side-effect-free: stub the Firebase app + SDK (whose
// ESM Jest doesn't transform) and the Expo runtime.
jest.mock('../lib/firebase', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: jest.fn(() => 'credential') },
  signInWithCredential: jest.fn(),
}));
jest.mock('expo-constants', () => ({ appOwnership: null }));

import {
  extractIdToken,
  googleErrorMessage,
  GoogleAuthError,
  isGoogleAuthAvailable,
} from '../lib/googleAuth';

describe('extractIdToken', () => {
  it('reads the current { data: { idToken } } shape', () => {
    expect(extractIdToken({ type: 'success', data: { idToken: 'abc' } })).toBe('abc');
  });

  it('reads the legacy { idToken } shape', () => {
    expect(extractIdToken({ idToken: 'legacy' })).toBe('legacy');
  });

  it('returns null for a cancelled response', () => {
    expect(extractIdToken({ type: 'cancelled' })).toBeNull();
  });

  it('returns null for empty / missing token', () => {
    expect(extractIdToken(null)).toBeNull();
    expect(extractIdToken({ data: {} })).toBeNull();
  });
});

describe('googleErrorMessage', () => {
  it('stays silent (null) on user cancellation', () => {
    expect(googleErrorMessage('cancelled')).toBeNull();
  });

  it('gives actionable copy for known failures', () => {
    expect(googleErrorMessage('play-services')).toMatch(/Play Services/i);
    expect(googleErrorMessage('no-token')).toMatch(/try again/i);
    expect(googleErrorMessage('unknown')).toMatch(/Google/i);
  });
});

describe('GoogleAuthError', () => {
  it('carries a mappable code', () => {
    const err = new GoogleAuthError('play-services');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('play-services');
    expect(err.name).toBe('GoogleAuthError');
  });
});

describe('isGoogleAuthAvailable', () => {
  it('is true outside Expo Go (appOwnership !== "expo")', () => {
    expect(isGoogleAuthAvailable).toBe(true);
  });
});
