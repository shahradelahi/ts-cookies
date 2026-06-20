/**
 * Configuration options for serializing a cookie.
 *
 * @example
 * const options: CookieSerializeOptions = {
 *   path: '/',
 *   secure: true,
 *   httpOnly: true,
 *   sameSite: 'lax',
 *   maxAge: '7d'
 * };
 */
export interface CookieSerializeOptions {
  /**
   * The domain for which the cookie is valid.
   */
  domain?: string;

  /**
   * The expiration date or time. Can be a Date object, timestamp, or string.
   */
  expires?: Date | number | string;

  /**
   * The maximum age of the cookie in seconds or as a duration string like '1h' or '7d'.
   */
  maxAge?: number | string;

  /**
   * The path of the cookie. Defaults to the current path if not specified.
   */
  path?: string;

  /**
   * When true, the cookie is only sent over secure HTTPS connections.
   */
  secure?: boolean;

  /**
   * When true, the cookie is inaccessible via document.cookie.
   */
  httpOnly?: boolean;

  /**
   * Controls cookie inclusion in cross-site requests.
   */
  sameSite?: 'lax' | 'strict' | 'none' | boolean;

  /**
   * When true, enables the Partitioned attribute (CHIPS).
   */
  partitioned?: boolean;

  /**
   * Sets the priority of the cookie as low, medium, or high.
   */
  priority?: 'low' | 'medium' | 'high';

  /**
   * A custom encoder function for the cookie value.
   */
  encode?: (val: string) => string;

  /**
   * Internally used flag or configuration for signed cookies.
   */
  signed?: boolean;

  /**
   * Internally used flag or configuration for encrypted cookies.
   */
  encrypted?: boolean;
}

/**
 * Represents a parsed incoming request cookie.
 */
export interface RequestCookie {
  /**
   * The name of the cookie.
   */
  name: string;
  /**
   * The value of the cookie.
   */
  value: string;
}

/**
 * Represents a parsed set-cookie or response cookie with all its metadata.
 */
export interface ResponseCookie extends RequestCookie {
  /**
   * The domain of the cookie.
   */
  domain?: string;
  /**
   * The explicit expiration date.
   */
  expires?: Date;
  /**
   * The lifetime of the cookie in seconds.
   */
  maxAge?: number;
  /**
   * The path of the cookie.
   */
  path?: string;
  /**
   * Indicates if the cookie is HTTPS-only.
   */
  secure?: boolean;
  /**
   * Indicates if the cookie is HTTP-only.
   */
  httpOnly?: boolean;
  /**
   * The SameSite attribute value.
   */
  sameSite?: 'lax' | 'strict' | 'none' | boolean;
  /**
   * Indicates if the cookie is partitioned.
   */
  partitioned?: boolean;
  /**
   * The cookie priority.
   */
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Options for configuring cookie jars, including cryptographic keys.
 *
 * @example
 * const options: CookieJarOptions = {
 *   secret: ['new-secret-key', 'old-fallback-key']
 * };
 */
export interface CookieJarOptions {
  /**
   * One or more secret keys used to sign or encrypt cookie values.
   */
  secret?: string | string[];
}
