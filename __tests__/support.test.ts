import { SUPPORT_EMAIL, PRIVACY_URL, TERMS_URL, supportMailto } from '../lib/support';

describe('support constants', () => {
  it('uses the real quorums.co.za support address', () => {
    expect(SUPPORT_EMAIL).toBe('support@quorums.co.za');
  });

  it('points legal URLs at the quorums.co.za domain', () => {
    expect(PRIVACY_URL).toBe('https://quorums.co.za/privacy');
    expect(TERMS_URL).toBe('https://quorums.co.za/terms');
  });
});

describe('supportMailto', () => {
  it('builds a mailto with a default subject', () => {
    const url = supportMailto();
    expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true);
    expect(url).toContain('Quorum%20Support');
  });

  it('encodes a custom subject', () => {
    const url = supportMailto('Need help signing in');
    expect(url).toBe(`mailto:${SUPPORT_EMAIL}?subject=Need%20help%20signing%20in`);
  });
});
