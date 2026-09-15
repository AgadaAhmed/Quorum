import { inviteDeepLink, inviteWebLink, inviteShareMessage } from '../../lib/invite';

describe('invite helpers', () => {
  it('builds a quorum deep link, upper-casing the code', () => {
    expect(inviteDeepLink('abc12345')).toBe('quorum://join/ABC12345');
  });

  it('builds a web/App-Links join URL, upper-casing the code', () => {
    expect(inviteWebLink('abc12345')).toBe('https://quorums.co.za/join/ABC12345');
  });

  it('share message includes the tappable web link, the plan title, and the code', () => {
    const msg = inviteShareMessage('Karaoke Night', 'abc12345');
    expect(msg).toContain('Karaoke Night');
    expect(msg).toContain('https://quorums.co.za/join/ABC12345');
    expect(msg).toContain('ABC12345');
  });

  it('trims surrounding whitespace in the code', () => {
    expect(inviteDeepLink('  xy  ')).toBe('quorum://join/XY');
    expect(inviteWebLink('  xy  ')).toBe('https://quorums.co.za/join/XY');
  });
});
