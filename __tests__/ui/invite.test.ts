import { inviteDeepLink, inviteShareMessage, PLAY_STORE_URL } from '../../lib/invite';

describe('invite helpers', () => {
  it('builds a quorum deep link, upper-casing the code', () => {
    expect(inviteDeepLink('abc12345')).toBe('quorum://join/ABC12345');
  });

  it('share message includes the deep link, the Play Store URL, and the code', () => {
    const msg = inviteShareMessage('Karaoke Night', 'abc12345');
    expect(msg).toContain('Karaoke Night');
    expect(msg).toContain('quorum://join/ABC12345');
    expect(msg).toContain(PLAY_STORE_URL);
    expect(msg).toContain('ABC12345');
  });

  it('trims surrounding whitespace in the code', () => {
    expect(inviteDeepLink('  xy  ')).toBe('quorum://join/XY');
  });
});
