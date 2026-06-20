import { describe, expect, it } from 'vitest';

import {
  CookieJar,
  CookiePrefixError,
  parseCookies,
  RequestCookies,
  ResponseCookies,
  serialize,
  splitCookiesString,
} from './index';

describe('@se-oss/cookies Core Serialization & Parsing', () => {
  it('should serialize basic cookies', () => {
    const s = serialize('foo', 'bar');
    expect(s).toBe('foo=bar');
  });

  it('should serialize with standard attributes', () => {
    const s = serialize('foo', 'bar', {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
    expect(s).toBe('foo=bar; Path=/; HttpOnly; Secure; SameSite=Lax');
  });

  it('should parse duration strings', () => {
    const s1 = serialize('foo', 'bar', { maxAge: '1h' });
    expect(s1).toContain('Max-Age=3600');

    const s2 = serialize('foo', 'bar', { maxAge: '7d' });
    expect(s2).toContain('Max-Age=604800');
  });

  it('should sync expires and maxAge both ways', () => {
    // Max-Age setting Expires
    const s1 = serialize('foo', 'bar', { maxAge: 10 });
    expect(s1).toContain('Max-Age=10');
    expect(s1).toContain('Expires=');

    // Expires setting Max-Age
    const futureDate = new Date(Date.now() + 5000);
    const s2 = serialize('foo', 'bar', { expires: futureDate });
    expect(s2).toContain('Expires=');
    expect(s2).toContain('Max-Age=');
  });

  it('should parse cookies safely without throwing on malformed percentages', () => {
    const raw = 'discount=50%off; theme=dark';
    const parsed = parseCookies(raw);
    expect(parsed).toEqual([
      { name: 'discount', value: '50%off' },
      { name: 'theme', value: 'dark' },
    ]);
  });

  it('should handle split Set-Cookie header strings with commas inside dates', () => {
    const raw = 'a=1; Path=/, b=2; Expires=Wed, 21 Oct 2015 07:28:00 GMT, c=3';
    const split = splitCookiesString(raw);
    expect(split).toEqual(['a=1; Path=/', 'b=2; Expires=Wed, 21 Oct 2015 07:28:00 GMT', 'c=3']);
  });
});

describe('Prefix Validation (RFC 6265bis)', () => {
  it('should enforce __Secure- prefix rules', () => {
    expect(() => serialize('__Secure-token', '123')).toThrow(CookiePrefixError);
    expect(serialize('__Secure-token', '123', { secure: true })).toBe('__Secure-token=123; Secure');
  });

  it('should enforce __Host- prefix rules', () => {
    expect(() => serialize('__Host-token', '123')).toThrow(CookiePrefixError);
    expect(() => serialize('__Host-token', '123', { secure: true, domain: 'example.com' })).toThrow(
      CookiePrefixError
    );
    expect(() => serialize('__Host-token', '123', { secure: true, path: '/api' })).toThrow(
      CookiePrefixError
    );

    const valid = serialize('__Host-token', '123', { secure: true, path: '/' });
    expect(valid).toBe('__Host-token=123; Path=/; Secure');
  });
});

describe('Advanced Security (Sign & Encrypt)', () => {
  it('should sign and verify cookies', async () => {
    const secret = 'my-super-secret-key';
    const reqHeaders = new Headers();
    const resCookies = new ResponseCookies(reqHeaders, { secret });

    await resCookies.setSigned('session', 'user_123');

    const signedValue = reqHeaders.get('Set-Cookie');
    expect(signedValue).toContain('session=user_123.');

    // Parse incoming signed cookie
    const incomingHeaders = new Headers();
    incomingHeaders.set('Cookie', signedValue!.split(';')[0]!);

    const requestCookies = new RequestCookies(incomingHeaders, { secret });
    const verified = await requestCookies.getSigned('session');
    expect(verified).toBe('user_123');

    // Tampered verification
    const tamperedHeaders = new Headers();
    tamperedHeaders.set('Cookie', 'session=user_123.fakeSignature');
    const tamperedRequest = new RequestCookies(tamperedHeaders, { secret });
    const tamperedResult = await tamperedRequest.getSigned('session');
    expect(tamperedResult).toBeUndefined();
  });

  it('should encrypt and decrypt cookies using AES-GCM', async () => {
    const secret = 'another-highly-secret-phrase';
    const reqHeaders = new Headers();
    const resCookies = new ResponseCookies(reqHeaders, { secret });

    await resCookies.setEncrypted('secret_data', 'confidential_payload');

    const encryptedValueStr = reqHeaders.get('Set-Cookie');
    expect(encryptedValueStr).toContain('secret_data=');
    expect(encryptedValueStr).not.toContain('confidential_payload');

    // Decrypt incoming cookie
    const incomingHeaders = new Headers();
    incomingHeaders.set('Cookie', encryptedValueStr!.split(';')[0]!);

    const requestCookies = new RequestCookies(incomingHeaders, { secret });
    const decrypted = await requestCookies.getEncrypted('secret_data');
    expect(decrypted).toBe('confidential_payload');
  });

  it('should support secret key rotation', async () => {
    const secretV1 = 'old-key';
    const secretV2 = 'new-key';
    const rotatedSecrets = [secretV2, secretV1];

    // Signed with V1 (old key)
    const resCookiesOld = new ResponseCookies(undefined, { secret: secretV1 });
    await resCookiesOld.setSigned('session', 'user_abc');
    const oldSignedCookie = resCookiesOld.get('session')?.value;

    // Read with rotated secrets (should succeed because old key is in the secret array)
    const incomingHeaders = new Headers();
    incomingHeaders.set('Cookie', `session=${oldSignedCookie}`);
    const reqCookies = new RequestCookies(incomingHeaders, { secret: rotatedSecrets });

    const verified = await reqCookies.getSigned('session');
    expect(verified).toBe('user_abc');
  });
});

describe('Chunking & Transparent Reassembly', () => {
  it('should split larger cookies into chunked parts and transparently reassemble them', () => {
    const headers = new Headers();
    const responseCookies = new ResponseCookies(headers);

    // Create a larger payload (around 5KB)
    const largeValue = 'A'.repeat(5000);
    responseCookies.set('large_cookie', largeValue);

    // Verifying it created chunks
    const allSetCookies = headers.getSetCookie();
    expect(allSetCookies.length).toBeGreaterThan(1);
    expect(allSetCookies[0]).toContain('large_cookie.0=');
    expect(allSetCookies[1]).toContain('large_cookie.1=');

    // Parse chunks transparently via RequestCookies
    const requestHeaders = new Headers();
    allSetCookies.forEach((sc) => {
      const parts = sc.split(';');
      const currentCookie = requestHeaders.get('Cookie');
      const suffix = currentCookie ? '; ' : '';
      requestHeaders.set('Cookie', (currentCookie ?? '') + suffix + parts[0]);
    });

    const requestCookies = new RequestCookies(requestHeaders);
    const retrieved = requestCookies.get('large_cookie');
    expect(retrieved?.value).toBe(largeValue);
    expect(requestCookies.has('large_cookie')).toBe(true);

    // Getting all cookies should synthesize chunks and omit chunk-specific entries
    const allRetrieved = requestCookies.getAll();
    const names = allRetrieved.map((r) => r.name);
    expect(names).toContain('large_cookie');
    expect(names).not.toContain('large_cookie.0');
    expect(names).not.toContain('large_cookie.1');
  });
});

describe('CookieJar proxy-based ergonomics', () => {
  it('should read, write, and delete cookies using friendly property notation', () => {
    const headers = new Headers();
    headers.set('Cookie', 'theme=dark; session=abc');

    const jar = new CookieJar(headers);

    // Dynamic Read
    expect(jar['theme']).toBe('dark');
    expect(jar['session']).toBe('abc');

    // Dynamic Write
    jar['theme'] = 'light';
    jar['new_cookie'] = 'hello';

    // Verify updating headers
    const setCookies = headers.getSetCookie();
    expect(setCookies).toContain('theme=light');
    expect(setCookies).toContain('new_cookie=hello');

    // Dynamic Delete
    delete jar['session'];
    const updatedSetCookies = headers.getSetCookie();
    // Max-Age=0 signifies deletion
    expect(
      updatedSetCookies.some((sc) => sc.includes('session=') && sc.includes('Max-Age=0'))
    ).toBe(true);
  });
});
