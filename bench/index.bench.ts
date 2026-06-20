import * as edgeCookies from '@edge-runtime/cookies';
import { parseCookies, RequestCookies, ResponseCookies, serialize } from '@se-oss/cookies';
import * as cookieLib from 'cookie';
import { bench, describe } from 'vitest';

describe('Cookies Parser Speed Comparison', () => {
  const cookieStr =
    'theme=dark; session=xyz123abc456; discount=50%off; has_voted=true; path=/; secure=true';

  bench('@se-oss/cookies (FSM Parser)', () => {
    parseCookies(cookieStr);
  });

  bench('cookie (Classic Parser)', () => {
    cookieLib.parse(cookieStr);
  });
});

describe('Cookies Serializer Speed Comparison', () => {
  const options = {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax' as const,
  };

  bench('@se-oss/cookies (Serializer)', () => {
    serialize('session_id', 'user_123456789', options);
  });

  bench('cookie (Classic Serializer)', () => {
    cookieLib.serialize('session_id', 'user_123456789', options);
  });
});

describe('RequestCookies Class Speed Comparison', () => {
  const cookieStr = 'theme=dark; session=xyz123abc456; discount=50%off; has_voted=true';

  bench('@se-oss/cookies RequestCookies', () => {
    const jar = new RequestCookies(cookieStr);
    jar.get('session');
  });

  bench('@edge-runtime/cookies RequestCookies', () => {
    const headers = new Headers();
    headers.set('Cookie', cookieStr);
    const jar = new edgeCookies.RequestCookies(headers);
    jar.get('session');
  });
});

describe('ResponseCookies Class Speed Comparison', () => {
  bench('@se-oss/cookies ResponseCookies', () => {
    const headers = new Headers();
    const jar = new ResponseCookies(headers);
    jar.set('session', 'xyz123abc456', { path: '/', secure: true });
  });

  bench('@edge-runtime/cookies ResponseCookies', () => {
    const headers = new Headers();
    const jar = new edgeCookies.ResponseCookies(headers);
    jar.set('session', 'xyz123abc456', { path: '/', secure: true });
  });
});
