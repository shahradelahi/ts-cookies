<h1 align="center">
  <sup>@se-oss/cookies</sup>
  <br>
  <a href="https://github.com/shahradelahi/ts-cookies/actions/workflows/ci.yml"><img src="https://github.com/shahradelahi/ts-cookies/actions/workflows/ci.yml/badge.svg?branch=main&event=push" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@se-oss/cookies"><img src="https://img.shields.io/npm/v/@se-oss/cookies.svg" alt="NPM Version"></a>
  <a href="/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat" alt="MIT License"></a>
  <a href="https://bundlephobia.com/package/@se-oss/cookies"><img src="https://img.shields.io/bundlephobia/minzip/@se-oss/cookies" alt="npm bundle size"></a>
  <a href="https://packagephobia.com/result?p=@se-oss/cookies"><img src="https://img.shields.io/packagephobia/badge?p=@se-oss/cookies" alt="Install Size"></a>
</h1>

_@se-oss/cookies_ is a lightweight, secure, and robust cookie manager for modern JavaScript and TypeScript environments, featuring transparent chunking, cryptographic signing, encryption, and strict RFC 6265bis prefix validation.

---

- [Installation](#-installation)
- [Usage](#-usage)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [License](#license)

## 📦 Installation

```bash
pnpm install @se-oss/cookies
```

<details>
<summary>Install using your favorite package manager</summary>

**npm**

```bash
npm install @se-oss/cookies
```

**yarn**

```bash
yarn add @se-oss/cookies
```

</details>

## 📖 Usage

### Basic Usage

Simple serialization and safe parsing of cookie headers.

```ts
import { parseCookies, serialize } from '@se-oss/cookies';

// Serialize standard cookie attributes
const cookieStr = serialize('theme', 'dark', {
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
  maxAge: '7d', // Accepts duration strings like '1h' or '7d'
});

// Parse cookie headers safely without throwing on malformed percent encoding
const parsed = parseCookies('theme=dark; discount=50%off');
// Output: [{ name: 'theme', value: 'dark' }, { name: 'discount', value: '50%off' }]
```

### RFC 6265bis Prefix Validation

Strict prefix enforcement for additional web security.

```ts
import { serialize } from '@se-oss/cookies';

// Automatically enforces secure and path rules for special prefixes
serialize('__Secure-session', 'value', { secure: true }); // OK

// The following will throw CookiePrefixError
serialize('__Host-session', 'value', { secure: true, domain: 'example.com' });
```

### Advanced Security

Cryptographic signing and encryption powered by the Web Crypto API.

```ts
import { RequestCookies, ResponseCookies } from '@se-oss/cookies';

const headers = new Headers();
const resCookies = new ResponseCookies(headers, {
  secret: 'my-super-secret-key',
});

// Cryptographically sign cookie value using HMAC-SHA256
await resCookies.setSigned('session', 'user_123');

// Cryptographically encrypt cookie value using AES-GCM
await resCookies.setEncrypted('payload', 'confidential_data');

// Retrieve and verify on incoming requests
const reqCookies = new RequestCookies(headers, {
  secret: 'my-super-secret-key',
});

const user = await reqCookies.getSigned('session'); // 'user_123'
const data = await reqCookies.getEncrypted('payload'); // 'confidential_data'
```

### Secret Key Rotation

Seamless decryption and signature verification with key rollouts.

```ts
import { RequestCookies } from '@se-oss/cookies';

// Pass an array of secrets; the first is used for signing/encryption,
// while older keys are tried sequentially for verification/decryption.
const reqCookies = new RequestCookies(headers, {
  secret: ['new-active-key', 'old-fallback-key-v1'],
});

const user = await reqCookies.getSigned('session');
```

### Automatic Chunking

Circumvent browser size limits by automatically splitting and reassembling large cookies.

```ts
import { RequestCookies, ResponseCookies } from '@se-oss/cookies';

const headers = new Headers();
const resCookies = new ResponseCookies(headers);

// Values larger than 4096 bytes are automatically split into chunked cookies
const largeValue = 'A'.repeat(5000);
resCookies.set('large_cookie', largeValue);
// Under the hood: sets `large_cookie.0` and `large_cookie.1`

// Reassembled seamlessly on retrieval
const reqCookies = new RequestCookies(headers);
const originalValue = reqCookies.get('large_cookie')?.value; // 'A'.repeat(5000)
```

### CookieJar Proxy Ergonomics

Dynamic property access to read and write cookies with clean, modern syntax.

```ts
import { CookieJar } from '@se-oss/cookies';

const jar = new CookieJar(headers, { secret: 'my-secret' });

// Read cookies as standard object properties
const theme = jar.theme;

// Set cookies directly
jar.theme = 'light';

// Delete cookies directly (sets Max-Age to 0)
delete jar.session;

// Chain advanced helper methods
await jar
  .$set('custom', 'value', { secure: true })
  .$setSigned('session', 'user_abc');
```

## 📚 Documentation

For all configuration options, please see [the API docs](https://www.jsdocs.io/package/@se-oss/cookies).

## 🤝 Contributing

Want to contribute? Awesome! To show your support is to star the project, or to raise issues on [GitHub](https://github.com/shahradelahi/ts-cookies).

Thanks again for your support, it is much appreciated! 🙏

## License

[MIT](/LICENSE) © [Shahrad Elahi](https://github.com/shahradelahi) and [contributors](https://github.com/shahradelahi/ts-cookies/graphs/contributors).
