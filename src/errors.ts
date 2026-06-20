/**
 * Base class for all cookie-related errors.
 */
export class CookieError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CookieError';
  }
}

/**
 * Thrown when a cookie value, name, or option fails validation.
 *
 * @example
 * throw new CookieValidationError('Invalid cookie name');
 */
export class CookieValidationError extends CookieError {
  constructor(message: string) {
    super(message);
    this.name = 'CookieValidationError';
  }
}

/**
 * Thrown when a secure cryptographic operation (signing or encryption) fails.
 */
export class CookieSecurityError extends CookieError {
  constructor(message: string) {
    super(message);
    this.name = 'CookieSecurityError';
  }
}

/**
 * Thrown when a cookie prefix like __Secure- or __Host- is used incorrectly.
 *
 * @example
 * throw new CookiePrefixError('__Host- cookies must specify a "path" option of "/".');
 */
export class CookiePrefixError extends CookieError {
  constructor(message: string) {
    super(message);
    this.name = 'CookiePrefixError';
  }
}
