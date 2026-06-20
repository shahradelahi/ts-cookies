import { CookieJarOptions, CookieSerializeOptions, RequestCookie, ResponseCookie } from './typings';
import {
  chunkCookie,
  decryptValue,
  encryptValue,
  getByteLength,
  parseCookies,
  parseDuration,
  parseSetCookieString,
  serialize,
  serializeCookieObject,
  signValue,
  splitCookiesString,
  verifyValue,
} from './utils';

export * from './typings';
export * from './errors';
export { parseCookies, splitCookiesString, serialize };

/**
 * Provides read-only access to incoming request cookies.
 * It handles standard cookies as well as signed, encrypted, and chunked cookies transparently.
 *
 * @example
 * const req = new RequestCookies(headers, { secret: 'my-secret' });
 * const theme = req.get('theme')?.value;
 * const session = await req.getSigned('session');
 */
export class RequestCookies {
  readonly #cookieHeader?: string;
  #cookies?: RequestCookie[];
  readonly #secret?: string | string[];

  /**
   * Create a new RequestCookies instance.
   *
   * @param input - Raw cookie header string, Headers instance, or Request object.
   * @param options - Configuration options, such as cryptographic secrets.
   */
  constructor(input?: string | Headers | Request, options?: CookieJarOptions) {
    this.#secret = options?.secret;
    if (typeof input === 'string') {
      this.#cookieHeader = input;
    } else if (input instanceof Headers) {
      this.#cookieHeader = input.get('cookie') ?? undefined;
    } else if (
      input &&
      typeof input === 'object' &&
      'headers' in input &&
      input.headers instanceof Headers
    ) {
      this.#cookieHeader = input.headers.get('cookie') ?? undefined;
    }
  }

  #getCookies(): RequestCookie[] {
    if (!this.#cookies) {
      this.#cookies = this.#cookieHeader ? parseCookies(this.#cookieHeader) : [];
    }
    return this.#cookies;
  }

  /**
   * Retrieve a cookie by name.
   * Transparently reassembles chunked cookies if present.
   *
   * @param name - The name of the cookie to retrieve.
   * @returns The RequestCookie object if found, otherwise undefined.
   *
   * @example
   * const cookie = req.get('session_id');
   */
  get(name: string): RequestCookie | undefined {
    const list = this.#getCookies();

    const hasChunkZero = list.some((c) => c.name === `${name}.0`);
    if (hasChunkZero) {
      const chunks: string[] = [];
      let i = 0;
      while (true) {
        const chunkName = `${name}.${i}`;
        const found = list.find((c) => c.name === chunkName);
        if (!found) break;
        chunks.push(found.value);
        i++;
      }
      return { name, value: chunks.join('') };
    }

    return list.find((c) => c.name === name);
  }

  /**
   * Retrieve all request cookies, or optionally filter for a specific cookie.
   * Synthesizes and excludes chunk-specific entries automatically.
   *
   * @param name - Optional cookie name to filter by.
   * @returns An array of parsed request cookies.
   *
   * @example
   * const cookies = req.getAll();
   */
  getAll(name?: string): RequestCookie[] {
    const list = this.#getCookies();
    if (name) {
      const single = this.get(name);
      return single ? [single] : [];
    }

    const result: RequestCookie[] = [];
    const processedNames = new Set<string>();

    for (const cookie of list) {
      const dotIdx = cookie.name.lastIndexOf('.');
      if (dotIdx !== -1) {
        const baseName = cookie.name.slice(0, dotIdx);
        const suffix = cookie.name.slice(dotIdx + 1);
        if (/^\d+$/.test(suffix)) {
          if (!processedNames.has(baseName)) {
            processedNames.add(baseName);
            const synthesized = this.get(baseName);
            if (synthesized) {
              result.push(synthesized);
            }
          }
          continue;
        }
      }

      if (!processedNames.has(cookie.name)) {
        processedNames.add(cookie.name);
        result.push(cookie);
      }
    }

    return result;
  }

  /**
   * Check if a cookie exists in the request.
   *
   * @param name - The name of the cookie.
   * @returns True if the cookie exists, false otherwise.
   */
  has(name: string): boolean {
    const list = this.#getCookies();
    return list.some((c) => c.name === name || c.name === `${name}.0`);
  }

  /**
   * Retrieve and verify a signed cookie.
   * Checks the signature against configured secret keys (supports key rotation).
   *
   * @param name - The name of the signed cookie.
   * @returns A promise resolving to the verified cookie value, or undefined if verification fails.
   *
   * @example
   * const user = await req.getSigned('user_session');
   */
  async getSigned(name: string): Promise<string | undefined> {
    const cookie = this.get(name);
    if (!cookie || !this.#secret) return undefined;

    const secrets = Array.isArray(this.#secret) ? this.#secret : [this.#secret];
    for (const secret of secrets) {
      const verified = await verifyValue(cookie.value, secret);
      if (verified !== null) {
        return verified;
      }
    }
    return undefined;
  }

  /**
   * Retrieve and decrypt an encrypted cookie.
   *
   * @param name - The name of the encrypted cookie.
   * @returns A promise resolving to the decrypted plaintext value, or undefined if decryption fails.
   *
   * @example
   * const payload = await req.getEncrypted('secure_data');
   */
  async getEncrypted(name: string): Promise<string | undefined> {
    const cookie = this.get(name);
    if (!cookie || !this.#secret) return undefined;

    const secrets = Array.isArray(this.#secret) ? this.#secret : [this.#secret];
    for (const secret of secrets) {
      const decrypted = await decryptValue(cookie.value, secret);
      if (decrypted !== null) {
        return decrypted;
      }
    }
    return undefined;
  }
}

/**
 * Manages outgoing cookies inside a Response or Headers object.
 * It supports standard cookies, chunking for large values, and cryptographically signed or encrypted values.
 *
 * @example
 * const res = new ResponseCookies(headers, { secret: 'my-secret' });
 * res.set('theme', 'dark');
 * await res.setSigned('user', 'id_123');
 */
export class ResponseCookies {
  #headers?: Headers;
  #cookies = new Map<string, ResponseCookie>();
  #secret?: string | string[];

  /**
   * Create a new ResponseCookies instance.
   * Automatically parses any existing Set-Cookie headers.
   *
   * @param headers - The optional Headers instance to synchronize with.
   * @param options - Configuration options, such as cryptographic secrets.
   */
  constructor(headers?: Headers, options?: CookieJarOptions) {
    this.#headers = headers;
    this.#secret = options?.secret;

    if (headers) {
      let setCookies: string[];
      if (typeof headers.getSetCookie === 'function') {
        setCookies = headers.getSetCookie();
      } else {
        const raw = headers.get('Set-Cookie');
        setCookies = splitCookiesString(raw);
      }

      for (const cookieStr of setCookies) {
        const parsed = parseSetCookieString(cookieStr);
        if (parsed) {
          this.#cookies.set(parsed.name, parsed);
        }
      }
    }
  }

  #sync() {
    if (!this.#headers) return;

    this.#headers.delete('Set-Cookie');

    for (const cookie of this.#cookies.values()) {
      const cookieStr = serializeCookieObject(cookie);
      this.#headers.append('Set-Cookie', cookieStr);
    }
  }

  #getSecret(): string | undefined {
    if (!this.#secret) return undefined;
    if (Array.isArray(this.#secret)) {
      return this.#secret[0];
    }
    return this.#secret;
  }

  /**
   * Retrieve a cookie by name from the response context.
   * Transparently reassembles chunked cookies.
   *
   * @param name - The name of the cookie.
   * @returns The ResponseCookie object if found, otherwise undefined.
   */
  get(name: string): ResponseCookie | undefined {
    const hasChunkZero = this.#cookies.has(`${name}.0`);
    if (hasChunkZero) {
      const chunks: string[] = [];
      let i = 0;
      let firstChunk: ResponseCookie | undefined;
      while (true) {
        const chunkName = `${name}.${i}`;
        const found = this.#cookies.get(chunkName);
        if (!found) break;
        if (i === 0) firstChunk = found;
        chunks.push(found.value);
        i++;
      }
      if (firstChunk) {
        return {
          ...firstChunk,
          name,
          value: chunks.join(''),
        };
      }
    }

    return this.#cookies.get(name);
  }

  /**
   * Retrieve all response cookies.
   *
   * @param name - Optional cookie name to filter by.
   * @returns An array of parsed response cookies.
   */
  getAll(name?: string): ResponseCookie[] {
    if (name) {
      const single = this.get(name);
      return single ? [single] : [];
    }

    const result: ResponseCookie[] = [];
    const processedNames = new Set<string>();

    for (const [key, cookie] of this.#cookies) {
      const dotIdx = key.lastIndexOf('.');
      if (dotIdx !== -1) {
        const baseName = key.slice(0, dotIdx);
        const suffix = key.slice(dotIdx + 1);
        if (/^\d+$/.test(suffix)) {
          if (!processedNames.has(baseName)) {
            processedNames.add(baseName);
            const synthesized = this.get(baseName);
            if (synthesized) {
              result.push(synthesized);
            }
          }
          continue;
        }
      }

      if (!processedNames.has(key)) {
        processedNames.add(key);
        result.push(cookie);
      }
    }

    return result;
  }

  /**
   * Check if a cookie has been set.
   *
   * @param name - The name of the cookie.
   * @returns True if the cookie exists, false otherwise.
   */
  has(name: string): boolean {
    return this.#cookies.has(name) || this.#cookies.has(`${name}.0`);
  }

  /**
   * Set a cookie value with options.
   * Handles chunking automatically if the serialized size exceeds 4096 bytes.
   *
   * @param name - The name of the cookie.
   * @param value - The raw string value.
   * @param options - Serialization and cookie attribute options.
   * @returns The ResponseCookies instance for chaining.
   *
   * @example
   * res.set('theme', 'light', { path: '/', httpOnly: true });
   */
  set(name: string, value: string, options?: CookieSerializeOptions): this {
    let chunkIdx = 0;
    while (this.#cookies.has(`${name}.${chunkIdx}`)) {
      this.#cookies.delete(`${name}.${chunkIdx}`);
      chunkIdx++;
    }

    const serialized = serialize(name, value, options);
    const size = getByteLength(serialized);

    let expiresDate: Date | undefined;
    if (options?.expires) {
      expiresDate =
        typeof options.expires === 'number' || typeof options.expires === 'string'
          ? new Date(options.expires)
          : options.expires;
    }
    const maxAgeNumber = options?.maxAge !== undefined ? parseDuration(options.maxAge) : undefined;

    if (size > 4096) {
      const chunks = chunkCookie(name, value, options ?? {});
      this.#cookies.delete(name);
      for (const chunk of chunks) {
        this.#cookies.set(chunk.name, {
          name: chunk.name,
          value: chunk.value,
          domain: options?.domain,
          expires: expiresDate,
          maxAge: maxAgeNumber,
          path: options?.path,
          secure: options?.secure,
          httpOnly: options?.httpOnly,
          sameSite: options?.sameSite,
          partitioned: options?.partitioned,
          priority: options?.priority,
        });
      }
    } else {
      this.#cookies.set(name, {
        name,
        value,
        domain: options?.domain,
        expires: expiresDate,
        maxAge: maxAgeNumber,
        path: options?.path,
        secure: options?.secure,
        httpOnly: options?.httpOnly,
        sameSite: options?.sameSite,
        partitioned: options?.partitioned,
        priority: options?.priority,
      });
    }

    this.#sync();
    return this;
  }

  /**
   * Sign and set a cookie value.
   *
   * @param name - The name of the cookie.
   * @param value - The raw string value to sign.
   * @param options - Additional cookie serialization options.
   * @returns A promise resolving to the ResponseCookies instance for chaining.
   * @throws {Error} If no secret key is configured.
   *
   * @example
   * await res.setSigned('session', 'user_123');
   */
  async setSigned(name: string, value: string, options?: CookieSerializeOptions): Promise<this> {
    const secret = this.#getSecret();
    if (!secret) {
      throw new Error('No secret configured for signing cookie.');
    }
    const signed = await signValue(value, secret);
    return this.set(name, signed, options);
  }

  /**
   * Encrypt and set a cookie value.
   *
   * @param name - The name of the cookie.
   * @param value - The raw string value to encrypt.
   * @param options - Additional cookie serialization options.
   * @returns A promise resolving to the ResponseCookies instance for chaining.
   * @throws {Error} If no secret key is configured.
   *
   * @example
   * await res.setEncrypted('credit_card', 'xxxx-xxxx-xxxx-xxxx');
   */
  async setEncrypted(name: string, value: string, options?: CookieSerializeOptions): Promise<this> {
    const secret = this.#getSecret();
    if (!secret) {
      throw new Error('No secret configured for encrypting cookie.');
    }
    const encrypted = await encryptValue(value, secret);
    return this.set(name, encrypted, options);
  }

  /**
   * Delete a cookie by setting its max-age to 0 and its expires date to the past.
   * Cleans up chunked cookies if they exist.
   *
   * @param name - The name of the cookie to delete.
   * @returns The ResponseCookies instance for chaining.
   *
   * @example
   * res.delete('theme');
   */
  delete(name: string): this {
    this.#cookies.delete(name);

    let chunkIdx = 0;
    while (this.#cookies.has(`${name}.${chunkIdx}`)) {
      this.#cookies.delete(`${name}.${chunkIdx}`);
      chunkIdx++;
    }

    this.#cookies.set(name, {
      name,
      value: '',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });

    this.#sync();
    return this;
  }

  /**
   * Clear all cookies from the response header by marking them as deleted.
   *
   * @returns The ResponseCookies instance for chaining.
   */
  clear(): this {
    for (const name of this.#cookies.keys()) {
      this.delete(name);
    }
    return this;
  }
}

/**
 * A proxy-based ergonomic wrapper around RequestCookies and ResponseCookies.
 * Allows reading and writing cookies directly as properties on the object.
 *
 * @example
 * const jar = new CookieJar(headers);
 * // Read a cookie value
 * console.log(jar.theme); // 'dark'
 *
 * // Write a cookie value
 * jar.new_cookie = 'hello';
 *
 * // Delete a cookie
 * delete jar.session;
 */
export class CookieJar {
  [key: string]: any;

  #requestCookies: RequestCookies;
  #responseCookies: ResponseCookies;

  /**
   * Create a new CookieJar instance.
   *
   * @param input - Raw cookie header string, Headers instance, or Request object.
   * @param options - Configuration options, such as cryptographic secrets.
   */
  constructor(input?: string | Headers | Request, options?: CookieJarOptions) {
    let headers: Headers | undefined;
    if (input instanceof Headers) {
      headers = input;
    } else if (
      input &&
      typeof input === 'object' &&
      'headers' in input &&
      input.headers instanceof Headers
    ) {
      headers = input.headers;
    }

    this.#requestCookies = new RequestCookies(input, options);
    this.#responseCookies = new ResponseCookies(headers, options);

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') {
          if (prop.startsWith('$')) {
            const actualProp = prop.slice(1);
            if (actualProp === 'request') {
              return target.#requestCookies;
            }
            if (actualProp === 'response') {
              return target.#responseCookies;
            }
            if (actualProp === 'set' || actualProp === 'delete') {
              return (target as any)[actualProp].bind(target);
            }
            return (target as any)[actualProp];
          }

          const resVal = target.#responseCookies.get(prop);
          if (resVal) return resVal.value;
          return target.#requestCookies.get(prop)?.value;
        }
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, val, receiver) {
        if (typeof prop === 'string') {
          if (prop.startsWith('$')) {
            return Reflect.set(target, prop, val, receiver);
          }
          target.#responseCookies.set(prop, String(val));
          return true;
        }
        return Reflect.set(target, prop, val, receiver);
      },
      deleteProperty(target, prop) {
        if (typeof prop === 'string') {
          if (prop.startsWith('$')) return false;
          target.#responseCookies.delete(prop);
          return true;
        }
        return false;
      },
    }) as any;
  }

  /**
   * Explicitly set a cookie value with advanced options.
   *
   * @param name - The name of the cookie.
   * @param value - The raw string value.
   * @param options - Additional cookie options.
   * @returns The CookieJar instance for chaining.
   *
   * @example
   * jar.$set('theme', 'dark', { path: '/', httpOnly: true });
   */
  $set(name: string, value: string, options?: CookieSerializeOptions): this {
    this.#responseCookies.set(name, value, options);
    return this;
  }

  /**
   * Explicitly set a signed cookie value.
   *
   * @param name - The name of the cookie.
   * @param value - The raw value to sign.
   * @param options - Additional cookie options.
   * @returns A promise resolving to the CookieJar instance.
   *
   * @example
   * await jar.$setSigned('session', 'user_123');
   */
  async $setSigned(name: string, value: string, options?: CookieSerializeOptions): Promise<this> {
    await this.#responseCookies.setSigned(name, value, options);
    return this;
  }

  /**
   * Explicitly set an encrypted cookie value.
   *
   * @param name - The name of the cookie.
   * @param value - The raw value to encrypt.
   * @param options - Additional cookie options.
   * @returns A promise resolving to the CookieJar instance.
   *
   * @example
   * await jar.$setEncrypted('secure_id', '12345');
   */
  async $setEncrypted(
    name: string,
    value: string,
    options?: CookieSerializeOptions
  ): Promise<this> {
    await this.#responseCookies.setEncrypted(name, value, options);
    return this;
  }

  /**
   * Explicitly delete a cookie by name.
   *
   * @param name - The name of the cookie to delete.
   * @returns The CookieJar instance.
   *
   * @example
   * jar.$delete('theme');
   */
  $delete(name: string): this {
    this.#responseCookies.delete(name);
    return this;
  }
}
