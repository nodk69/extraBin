import '@testing-library/jest-dom';
import { webcrypto } from 'node:crypto';

// Ensure Web Crypto API is consistently available in jsdom test environment
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}
