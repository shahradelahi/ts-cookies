import { CookiePrefixError, CookieValidationError } from './errors';
import { CookieSerializeOptions, RequestCookie, ResponseCookie } from './typings';

const fieldNameRegExp = /^[\x21\x23-\x27\x2a\x2b\x2d\x2e\x30-\x39\x41-\x5a\x5e-\x7a\x7c\x7e]+$/;
const ipv4RegExp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
const ipv6RegExp = /^\[?[a-f0-9]*:[a-f0-9:]+\]?$/i;

const msMap: Record<string, number> = {
  s: 1,
  sec: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hour: 3600,
  hours: 3600,
  d: 86400,
  day: 86400,
  days: 86400,
  w: 604800,
  week: 604800,
  weeks: 604800,
  y: 31536000,
  year: 31536000,
  years: 31536000,
};

/**
 * Parse a duration string or number into seconds.
 * Supports units like s, m, h, d, w, y.
 *
 * @param val - The duration to parse.
 * @returns Parsed duration in seconds.
 * @throws {CookieValidationError} If the duration string format is invalid or unknown.
 *
 * @example
 * parseDuration('1h'); // returns 3600
 * parseDuration('7d'); // returns 604800
 * parseDuration(120);  // returns 120
 */
export function parseDuration(val: string | number): number {
  if (typeof val === 'number') {
    return Math.floor(val);
  }
  const match = /^([+-]?\d+(?:\.\d+)?)\s*([a-z]+)?$/i.exec(val.trim());
  if (!match) {
    throw new CookieValidationError(`Invalid duration string: "${val}"`);
  }
  const amountStr = match[1] ?? '0';
  const amount = parseFloat(amountStr);
  const unit = match[2]?.toLowerCase();
  if (!unit) {
    return Math.floor(amount);
  }
  const scale = msMap[unit];
  if (scale === undefined) {
    throw new CookieValidationError(`Unknown duration unit: "${unit}"`);
  }
  return Math.floor(amount * scale);
}

/**
 * Safely decode a URI component.
 * Returns the original string if decoding fails.
 *
 * @param str - The string to decode.
 * @returns The decoded string, or the input string if decoding throws.
 */
export function safeDecodeURIComponent(str: string): string {
  try {
    return str.includes('%') ? decodeURIComponent(str) : str;
  } catch {
    return str;
  }
}

/**
 * Parse a Cookie header string into an array of RequestCookie objects.
 * This function parses malformed percentages safely without throwing.
 *
 * @param cookieHeader - The raw Cookie header string from the request.
 * @param options - Parse configuration options.
 * @returns Array of parsed request cookies.
 *
 * @example
 * parseCookies('theme=dark; user=john');
 * // returns [{ name: 'theme', value: 'dark' }, { name: 'user', value: 'john' }]
 */
export function parseCookies(
  cookieHeader: string,
  options?: { decode?: (val: string) => string }
): RequestCookie[] {
  const cookies: RequestCookie[] = [];
  const len = cookieHeader.length;
  let pos = 0;
  const decoder = options?.decode ?? safeDecodeURIComponent;

  while (pos < len) {
    while (pos < len && cookieHeader.charCodeAt(pos) === 0x20) {
      pos++;
    }

    if (pos >= len) break;

    const keyStart = pos;
    while (pos < len) {
      const code = cookieHeader.charCodeAt(pos);
      if (code === 0x3d || code === 0x3b) {
        break;
      }
      pos++;
    }

    const keyEnd = pos;
    let value = '';

    if (pos < len && cookieHeader.charCodeAt(pos) === 0x3d) {
      pos++;
      let hasQuotes = false;
      if (pos < len && cookieHeader.charCodeAt(pos) === 0x22) {
        hasQuotes = true;
        pos++;
      }

      const valStart = pos;
      while (pos < len && cookieHeader.charCodeAt(pos) !== 0x3b) {
        pos++;
      }
      let valEnd = pos;

      if (hasQuotes && valEnd > valStart && cookieHeader.charCodeAt(valEnd - 1) === 0x22) {
        valEnd--;
      }

      value = cookieHeader.slice(valStart, valEnd);
    }

    if (keyEnd > keyStart) {
      const name = cookieHeader.slice(keyStart, keyEnd).trim();
      cookies.push({ name, value: decoder(value) });
    }

    pos++;
  }

  return cookies;
}

/**
 * Split a set-cookie header string (or array) by comma separators,
 * while ignoring commas that appear inside date values.
 *
 * @param header - The Set-Cookie header string, list of strings, or null/undefined.
 * @returns An array of individual Set-Cookie directive strings.
 *
 * @example
 * splitCookiesString('a=1; Path=/, b=2; Expires=Wed, 21 Oct 2015 07:28:00 GMT');
 * // returns ['a=1; Path=/', 'b=2; Expires=Wed, 21 Oct 2015 07:28:00 GMT']
 */
export function splitCookiesString(header: string | string[] | null | undefined): string[] {
  if (!header) return [];
  if (Array.isArray(header)) {
    return header.flatMap((h) => splitCookiesString(h));
  }

  const cookies: string[] = [];
  let pos = 0;
  const len = header.length;
  let start = 0;

  while (pos < len) {
    while (pos < len && header.charCodeAt(pos) === 0x20) {
      pos++;
    }

    let insideQuote = false;
    while (pos < len) {
      const charCode = header.charCodeAt(pos);
      if (charCode === 0x22) {
        insideQuote = !insideQuote;
      } else if (charCode === 0x2c && !insideQuote) {
        break;
      }
      pos++;
    }

    if (pos >= len) {
      cookies.push(header.slice(start, len));
      break;
    }

    let peek = pos + 1;
    while (peek < len && header.charCodeAt(peek) === 0x20) {
      peek++;
    }

    let isSeparator = false;
    let nextEq = peek;
    while (
      nextEq < len &&
      header.charCodeAt(nextEq) !== 0x3d &&
      header.charCodeAt(nextEq) !== 0x3b &&
      header.charCodeAt(nextEq) !== 0x2c
    ) {
      nextEq++;
    }

    if (nextEq < len && header.charCodeAt(nextEq) === 0x3d) {
      const token = header.slice(peek, nextEq).trim().toLowerCase();
      const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      if (!days.includes(token)) {
        isSeparator = true;
      }
    }

    if (isSeparator) {
      cookies.push(header.slice(start, pos));
      start = peek;
      pos = peek;
    } else {
      pos++;
    }
  }

  return cookies.filter(Boolean);
}

/**
 * Sanitize the domain by removing a leading dot, unless the candidate is an IP address.
 *
 * @param domain - The cookie domain to sanitize.
 * @returns Sanitized domain.
 */
export function sanitizeDomain(domain: string): string {
  let d = domain;
  if (d.startsWith('.')) {
    const candidate = d.slice(1);
    if (ipv4RegExp.test(candidate) || ipv6RegExp.test(candidate)) {
      d = candidate;
    }
  }
  return d;
}

/**
 * Enforce __Secure- and __Host- prefix rules according to RFC 6265bis.
 *
 * @param name - The name of the cookie.
 * @param options - Cookie serialization options.
 * @throws {CookiePrefixError} If the cookie prefix rules are violated.
 */
export function validatePrefixes(name: string, options?: CookieSerializeOptions) {
  if (name.startsWith('__Secure-')) {
    if (!options?.secure) {
      throw new CookiePrefixError('__Secure- cookies must be set with the "secure" option.');
    }
  } else if (name.startsWith('__Host-')) {
    if (!options?.secure) {
      throw new CookiePrefixError('__Host- cookies must be set with the "secure" option.');
    }
    if (options?.domain) {
      throw new CookiePrefixError('__Host- cookies must not specify a "domain" option.');
    }
    if (options?.path !== '/') {
      throw new CookiePrefixError('__Host- cookies must specify a "path" option of "/".');
    }
  }
}

/**
 * Check if a string contains any invalid control characters or CRLF sequences.
 *
 * @param str - The string to check.
 * @returns True if control characters are found, false otherwise.
 */
export function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Serialize a cookie name and value into a Set-Cookie header string.
 *
 * This function validates the cookie name, checks for control characters,
 * enforces RFC 6265bis prefixes, handles max-age/expires synchronization,
 * and appends attributes like Path, Domain, Secure, HttpOnly, SameSite, and Partitioned.
 *
 * @param name - The unique name of the cookie.
 * @param value - The value to store in the cookie.
 * @param options - Additional serialization attributes.
 * @returns The fully formatted Set-Cookie header string.
 * @throws {CookieValidationError} If name is invalid or options are malformed.
 * @throws {CookiePrefixError} If prefix restrictions are violated.
 *
 * @example
 * serialize('session', '123', { secure: true, httpOnly: true });
 * // returns 'session=123; HttpOnly; Secure'
 */
export function serialize(name: string, value: string, options?: CookieSerializeOptions): string {
  if (!fieldNameRegExp.test(name)) {
    throw new CookieValidationError(`Invalid cookie name: "${name}".`);
  }

  const encoder = options?.encode ?? encodeURIComponent;
  const encodedValue = encoder(value);

  if (hasControlCharacters(encodedValue)) {
    throw new CookieValidationError('Cookie value contains invalid control characters or CRLF.');
  }

  validatePrefixes(name, options);

  let str = `${name}=${encodedValue}`;

  if (options) {
    if (options.domain) {
      const dom = sanitizeDomain(options.domain);
      str += `; Domain=${dom}`;
    }

    if (options.path) {
      str += `; Path=${options.path}`;
    }

    if (options.expires) {
      let exp = options.expires;
      if (typeof exp === 'number' || typeof exp === 'string') {
        exp = new Date(exp);
      }
      if (isNaN(exp.getTime())) {
        throw new CookieValidationError('Invalid Date provided for "expires" option.');
      }
      str += `; Expires=${exp.toUTCString()}`;
    }

    if (options.expires && options.maxAge === undefined) {
      let exp = options.expires;
      if (typeof exp === 'number' || typeof exp === 'string') exp = new Date(exp);
      if (!isNaN(exp.getTime())) {
        const calculatedMaxAge = Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000));
        str += `; Max-Age=${calculatedMaxAge}`;
      }
    }

    if (options.maxAge !== undefined) {
      const maxAgeSec = parseDuration(options.maxAge);
      if (isNaN(maxAgeSec)) {
        throw new CookieValidationError('Invalid duration provided for "maxAge" option.');
      }
      str += `; Max-Age=${maxAgeSec}`;
    }

    if (options.maxAge !== undefined && options.expires === undefined) {
      const maxAgeSec = parseDuration(options.maxAge);
      if (!isNaN(maxAgeSec)) {
        const expDate = new Date(Date.now() + maxAgeSec * 1000);
        str += `; Expires=${expDate.toUTCString()}`;
      }
    }

    if (options.httpOnly) {
      str += '; HttpOnly';
    }

    if (options.secure) {
      str += '; Secure';
    }

    if (options.sameSite !== undefined) {
      const ss = options.sameSite;
      if (ss === true) {
        str += '; SameSite=Strict';
      } else if (ss === false) {
        // omit SameSite
      } else {
        const ssLower = ss.toLowerCase();
        if (ssLower === 'lax') {
          str += '; SameSite=Lax';
        } else if (ssLower === 'strict') {
          str += '; SameSite=Strict';
        } else if (ssLower === 'none') {
          str += '; SameSite=None';
        } else {
          throw new CookieValidationError(`Invalid "sameSite" option value: "${ss}".`);
        }
      }
    }

    if (options.priority) {
      const p = options.priority.toLowerCase();
      if (p === 'low' || p === 'medium' || p === 'high') {
        const cap = p.charAt(0).toUpperCase() + p.slice(1);
        str += `; Priority=${cap}`;
      } else {
        throw new CookieValidationError(`Invalid "priority" option value: "${p}".`);
      }
    }

    if (options.partitioned) {
      str += '; Partitioned';
    }
  }

  return str;
}

/**
 * Calculate the exact UTF-8 byte length of a string.
 *
 * @param str - The string to measure.
 * @returns The size of the string in bytes.
 *
 * @example
 * getByteLength('hello'); // returns 5
 * getByteLength('🔥');    // returns 4
 */
export function getByteLength(str: string): number {
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      len += 1;
    } else if (code < 0x800) {
      len += 2;
    } else if (code >= 0xd800 && code <= 0xdfff) {
      len += 4;
      i++;
    } else {
      len += 3;
    }
  }
  return len;
}

/**
 * Split a cookie with a large value into smaller chunked cookies.
 * This helps circumvent standard browser size limits (typically 4096 bytes per cookie).
 *
 * @param name - The base name of the cookie.
 * @param value - The complete large string value.
 * @param options - Cookie options used for serialization of individual chunks.
 * @param chunkLimit - Maximum byte length allowed for each serialized cookie. Defaults to 4000.
 * @returns An array of named chunks ready for individual serialization.
 * @throws {CookieValidationError} If options/metadata size alone exceeds the chunk limit.
 *
 * @example
 * chunkCookie('large', 'A'.repeat(5000), { path: '/' }, 4000);
 * // returns [{ name: 'large.0', value: '...' }, { name: 'large.1', value: '...' }]
 */
export function chunkCookie(
  name: string,
  value: string,
  options: CookieSerializeOptions,
  chunkLimit: number = 4000
): { name: string; value: string }[] {
  const baseSerialized = serialize(name, '', options);
  const baseSize = getByteLength(baseSerialized);

  if (baseSize + getByteLength(value) <= chunkLimit) {
    return [{ name, value }];
  }

  const chunks: { name: string; value: string }[] = [];
  const valueBytes = new TextEncoder().encode(value);
  let offset = 0;
  let chunkIdx = 0;

  while (offset < valueBytes.length) {
    const chunkName = `${name}.${chunkIdx}`;
    const chunkBaseSize = getByteLength(serialize(chunkName, '', options));
    const availableBytes = chunkLimit - chunkBaseSize;
    if (availableBytes <= 0) {
      throw new CookieValidationError(
        `Cookie metadata size exceeds chunk limit for "${chunkName}".`
      );
    }

    const end = Math.min(offset + availableBytes, valueBytes.length);
    const chunkBytes = valueBytes.subarray(offset, end);
    const chunkValue = new TextDecoder().decode(chunkBytes);

    chunks.push({ name: chunkName, value: chunkValue });
    offset = end;
    chunkIdx++;
  }

  return chunks;
}

// HMAC Signing Helper
async function getHMACKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Sign a cookie value with HMAC-SHA256 using Web Crypto API.
 * Appends the hex-encoded signature to the value, separated by a dot.
 *
 * @param value - The raw cookie value to sign.
 * @param secret - The private key or secret string.
 * @returns A promise that resolves to the signed value string.
 *
 * @example
 * await signValue('hello', 'secret-key');
 * // returns 'hello.8d969...signature'
 */
export async function signValue(value: string, secret: string): Promise<string> {
  const key = await getHMACKey(secret);
  const encoder = new TextEncoder();
  const signatureBuffer = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(value));
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const signatureHex = signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${value}.${signatureHex}`;
}

/**
 * Verify a signed cookie value using HMAC-SHA256.
 * Re-computes the HMAC signature and compares it to verify authenticity.
 *
 * @param signedValue - The signed cookie value containing the signature.
 * @param secret - The private key or secret string used for signing.
 * @returns A promise that resolves to the original value if valid, or null if tampered.
 *
 * @example
 * await verifyValue('hello.valid_signature', 'secret-key'); // returns 'hello'
 * await verifyValue('hello.invalid_signature', 'secret-key'); // returns null
 */
export async function verifyValue(signedValue: string, secret: string): Promise<string | null> {
  const lastDot = signedValue.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signedValue.slice(0, lastDot);
  const signatureHex = signedValue.slice(lastDot + 1);

  if (signatureHex.length % 2 !== 0) return null;
  const signatureBytes = new Uint8Array(signatureHex.length / 2);
  for (let i = 0; i < signatureBytes.length; i++) {
    signatureBytes[i] = parseInt(signatureHex.slice(i * 2, i * 2 + 2), 16);
  }

  const key = await getHMACKey(secret);
  const encoder = new TextEncoder();
  const isValid = await globalThis.crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(value)
  );

  return isValid ? value : null;
}

// AES-GCM Encryption Helper
async function getAESKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return globalThis.crypto.subtle.importKey('raw', hashBuffer, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    const val = bytes[i];
    if (val !== undefined) {
      binary += String.fromCharCode(val);
    }
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypt a cookie value using AES-GCM (128-bit IV) with Web Crypto API.
 * The derived key is generated using SHA-256 on the secret.
 * The result is URL-safe Base64 encoded.
 *
 * @param value - The raw plaintext string to encrypt.
 * @param secret - The private passphrase or secret.
 * @returns A promise that resolves to the URL-safe Base64 ciphertext.
 *
 * @example
 * await encryptValue('secret message', 'passphrase');
 * // returns 'ENC_BASE64_URL_SAFE_STRING'
 */
export async function encryptValue(value: string, secret: string): Promise<string> {
  const key = await getAESKey(secret);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encryptedBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    encoder.encode(value)
  );

  const payload = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encryptedBuffer), iv.length);

  return base64UrlEncode(payload);
}

/**
 * Decrypt an AES-GCM encrypted cookie value.
 *
 * @param encryptedValue - The URL-safe Base64 encrypted cookie value.
 * @param secret - The private passphrase or secret used to encrypt the value.
 * @returns A promise that resolves to the decrypted plaintext string, or null on failure.
 *
 * @example
 * await decryptValue('ENC_BASE64_URL_SAFE_STRING', 'passphrase');
 * // returns 'secret message'
 */
export async function decryptValue(encryptedValue: string, secret: string): Promise<string | null> {
  try {
    const key = await getAESKey(secret);
    const payload = base64UrlDecode(encryptedValue);
    if (payload.length < 13) return null;

    const iv = payload.subarray(0, 12);
    const ciphertext = payload.subarray(12);

    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as any },
      key,
      ciphertext as any
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    return null;
  }
}

/**
 * Parse a Set-Cookie header string into a structured ResponseCookie object.
 * Extracts standard attributes like Domain, Path, Expires, Max-Age, and SameSite.
 *
 * @param str - The raw Set-Cookie header string.
 * @returns A ResponseCookie object, or null if the string is invalid.
 *
 * @example
 * parseSetCookieString('theme=dark; Path=/; Secure; SameSite=Lax');
 * // returns { name: 'theme', value: 'dark', path: '/', secure: true, sameSite: 'lax' }
 */
export function parseSetCookieString(str: string): ResponseCookie | null {
  const parts = str.split(';');
  const first = parts[0];
  if (!first) return null;

  const eqIdx = first.indexOf('=');
  if (eqIdx === -1) return null;
  const name = first.slice(0, eqIdx).trim();
  let value = first.slice(eqIdx + 1);

  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  value = safeDecodeURIComponent(value);

  const cookie: ResponseCookie = { name, value };

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]?.trim();
    if (!part) continue;

    const eq = part.indexOf('=');
    if (eq === -1) {
      const key = part.toLowerCase();
      if (key === 'httponly') {
        cookie.httpOnly = true;
      } else if (key === 'secure') {
        cookie.secure = true;
      } else if (key === 'partitioned') {
        cookie.partitioned = true;
      }
    } else {
      const key = part.slice(0, eq).trim().toLowerCase();
      const val = part.slice(eq + 1).trim();

      if (key === 'domain') {
        cookie.domain = val;
      } else if (key === 'path') {
        cookie.path = val;
      } else if (key === 'expires') {
        cookie.expires = new Date(val);
      } else if (key === 'max-age') {
        cookie.maxAge = parseInt(val, 10);
      } else if (key === 'samesite') {
        const lowerVal = val.toLowerCase();
        if (lowerVal === 'lax' || lowerVal === 'strict' || lowerVal === 'none') {
          cookie.sameSite = lowerVal;
        } else {
          cookie.sameSite = val as any;
        }
      } else if (key === 'priority') {
        const lowerVal = val.toLowerCase();
        if (lowerVal === 'low' || lowerVal === 'medium' || lowerVal === 'high') {
          cookie.priority = lowerVal;
        }
      }
    }
  }

  return cookie;
}

/**
 * Serialize a ResponseCookie object back into a Set-Cookie header string.
 *
 * @param cookie - The response cookie object.
 * @returns The fully serialized Set-Cookie header string.
 */
export function serializeCookieObject(cookie: ResponseCookie): string {
  const options: CookieSerializeOptions = {
    domain: cookie.domain,
    expires: cookie.expires,
    maxAge: cookie.maxAge,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    partitioned: cookie.partitioned,
    priority: cookie.priority,
  };
  return serialize(cookie.name, cookie.value, options);
}
