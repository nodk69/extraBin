/**
 * Client-Side End-to-End Cryptographic Engine for ExtraBin.
 * Implements AES-GCM-256 authenticated encryption, PBKDF2-SHA256 key derivation,
 * dual-access key wrapping, and Additional Authenticated Data (AAD) context binding.
 */

export type EncryptionMode = 'LINK' | 'PASSPHRASE';

export interface EncryptedFilePayloadDTO {
  filenameHint: string;
  nonce: string;       // Base64 (strictly 12 bytes)
  ciphertext: string;  // Base64 (1 byte to 1 MiB)
  authTag: string;     // Base64 (strictly 16 bytes)
}

export interface CreateEncryptedPasteRequestDTO {
  files: EncryptedFilePayloadDTO[];
  encryptionMode: EncryptionMode;
  kdfSalt: string;            // Base64 (strictly 16 bytes)
  kdfIterations: number;      // 600,000 to 2,000,000
  wrappedKey: string | null;  // Base64 (strictly 60 bytes) or null
  burnAfterReading?: boolean;
  languageHint?: string;
}

export interface EncryptedPasteViewDTO {
  id: string;
  encryptionMode: EncryptionMode;
  kdfSalt: string;            // Base64 (16 bytes)
  kdfIterations: number;
  wrappedKey: string | null;  // Base64 (60 bytes) or null
  burnAfterReading: boolean;
  files: Array<{
    id?: number;
    filename: string;
    nonce: string;            // Base64 (12 bytes)
    ciphertext: string;       // Base64
    authTag: string;          // Base64 (16 bytes)
  }>;
}

export interface InputFile {
  filename: string;
  data: Uint8Array | string;
}

export interface DecryptedFile {
  filename: string;
  bytes: Uint8Array;
  text?: string;
}

export interface EncryptedPasteResult {
  dto: CreateEncryptedPasteRequestDTO;
  linkKey?: string; // URL-safe base64 string for URL fragment (#key=...)
}

export class DecryptionFailedError extends Error {
  constructor(message = 'Failed to decrypt paste. Authentication tag mismatch or invalid key/passphrase.') {
    super(message);
    this.name = 'DecryptionFailedError';
  }
}

export class InvalidKdfParametersError extends Error {
  constructor(message = 'KDF parameters out of allowed bounds (600,000 - 2,000,000 iterations).') {
    super(message);
    this.name = 'InvalidKdfParametersError';
  }
}

export class CryptoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoValidationError';
  }
}

function getSubtle(): SubtleCrypto {
  const subtle = (typeof window !== 'undefined' && window.crypto?.subtle) || globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (subtle) is not available in the current environment');
  }
  return subtle;
}

export function generateMasterKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
  if (!cryptoObj) {
    throw new Error('Web Crypto API is not available');
  }
  cryptoObj.getRandomValues(bytes);
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  if (typeof b64 !== 'string') {
    throw new CryptoValidationError('Input must be a string');
  }
  if (b64 === '') {
    return new Uint8Array(0);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) {
    throw new CryptoValidationError('Invalid base64 string');
  }
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    throw new CryptoValidationError('Failed to decode base64: ' + (e instanceof Error ? e.message : String(e)));
  }
}

export function toUrlSafeBase64(bytes: Uint8Array): string {
  return toBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function fromUrlSafeBase64(b64: string): Uint8Array {
  if (typeof b64 !== 'string') {
    throw new CryptoValidationError('Input must be a string');
  }
  if (b64 === '') {
    return new Uint8Array(0);
  }
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(b64)) {
    throw new CryptoValidationError('Invalid URL-safe base64 string');
  }
  const pad = (4 - (b64.length % 4)) % 4;
  const standardB64 = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  return fromBase64(standardB64);
}

export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations = 600000
): Promise<CryptoKey> {
  if (iterations < 600000 || iterations > 2000000) {
    throw new InvalidKdfParametersError();
  }
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapMasterKey(
  masterKeyBytes: Uint8Array,
  passphrase: string,
  salt: Uint8Array,
  iterations = 600000
): Promise<Uint8Array> {
  if (iterations < 600000 || iterations > 2000000) {
    throw new InvalidKdfParametersError();
  }
  if (!masterKeyBytes || masterKeyBytes.length !== 32) {
    throw new CryptoValidationError('Master key must be exactly 32 bytes');
  }

  const subtle = getSubtle();
  const kek = await deriveKeyFromPassphrase(passphrase, salt, iterations);
  const iv = new Uint8Array(12);
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
  cryptoObj.getRandomValues(iv);

  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    kek,
    masterKeyBytes as BufferSource
  );

  // Result of AES-GCM encrypt is ciphertext (32 bytes) || authTag (16 bytes) = 48 bytes
  // Wrapped key format: iv (12B) || ciphertext (32B) || authTag (16B) = 60 bytes
  const wrapped = new Uint8Array(12 + encrypted.byteLength);
  wrapped.set(iv, 0);
  wrapped.set(new Uint8Array(encrypted), 12);
  return wrapped;
}

export async function unwrapMasterKey(
  wrappedKeyBytes: Uint8Array,
  passphrase: string,
  salt: Uint8Array,
  iterations = 600000
): Promise<Uint8Array> {
  if (iterations < 600000 || iterations > 2000000) {
    throw new InvalidKdfParametersError();
  }
  if (!wrappedKeyBytes || wrappedKeyBytes.length !== 60) {
    throw new CryptoValidationError('Wrapped key must be exactly 60 bytes');
  }

  const subtle = getSubtle();
  const iv = wrappedKeyBytes.slice(0, 12);
  const ciphertextAndTag = wrappedKeyBytes.slice(12);

  const kek = await deriveKeyFromPassphrase(passphrase, salt, iterations);

  try {
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      kek,
      ciphertextAndTag as BufferSource
    );
    const masterKey = new Uint8Array(decrypted);
    if (masterKey.length !== 32) {
      throw new DecryptionFailedError('Unwrapped key must be 32 bytes');
    }
    return masterKey;
  } catch (e) {
    if (e instanceof CryptoValidationError) throw e;
    throw new DecryptionFailedError();
  }
}

export async function encryptPaste(
  files: InputFile[],
  options: {
    mode: EncryptionMode;
    passphrase?: string;
    iterations?: number;
    burnAfterReading?: boolean;
    languageHint?: string;
    pasteId?: string;
  }
): Promise<EncryptedPasteResult> {
  if (!Array.isArray(files) || files.length === 0) {
    throw new CryptoValidationError('Files array must not be empty');
  }

  if (options.mode !== 'LINK' && options.mode !== 'PASSPHRASE') {
    throw new CryptoValidationError(`Unsupported encryption mode: ${options.mode}`);
  }

  const iterations = options.iterations ?? 600000;
  if (iterations < 600000 || iterations > 2000000) {
    throw new InvalidKdfParametersError();
  }

  if (options.mode === 'PASSPHRASE') {
    if (!options.passphrase || options.passphrase.trim() === '') {
      throw new CryptoValidationError('Passphrase is required and cannot be blank in PASSPHRASE mode');
    }
  }

  const subtle = getSubtle();
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
  const salt = new Uint8Array(16);
  cryptoObj.getRandomValues(salt);

  let cryptoKey: CryptoKey;
  let linkKey: string | undefined;
  let wrappedKeyStr: string | null = null;

  if (options.mode === 'LINK') {
    const masterKeyBytes = generateMasterKey();
    linkKey = toUrlSafeBase64(masterKeyBytes);

    cryptoKey = await subtle.importKey(
      'raw',
      masterKeyBytes as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    if (options.passphrase && options.passphrase.trim() !== '') {
      const wrappedBytes = await wrapMasterKey(masterKeyBytes, options.passphrase, salt, iterations);
      wrappedKeyStr = toBase64(wrappedBytes);
    }
  } else {
    // PASSPHRASE mode
    cryptoKey = await deriveKeyFromPassphrase(options.passphrase!, salt, iterations);
    linkKey = undefined;
    wrappedKeyStr = null;
  }

  const pasteId = options.pasteId ?? '';
  const encryptedFiles: EncryptedFilePayloadDTO[] = [];

  for (const file of files) {
    const dataBytes = typeof file.data === 'string'
      ? new TextEncoder().encode(file.data)
      : file.data;

    const nonce = new Uint8Array(12);
    cryptoObj.getRandomValues(nonce);

    const aad = new TextEncoder().encode(pasteId + ':' + file.filename);

    const encryptedBuffer = await subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
      cryptoKey,
      dataBytes as BufferSource
    );

    const totalLen = encryptedBuffer.byteLength;
    const ciphertextBytes = new Uint8Array(encryptedBuffer, 0, totalLen - 16);
    const authTagBytes = new Uint8Array(encryptedBuffer, totalLen - 16, 16);

    encryptedFiles.push({
      filenameHint: file.filename,
      nonce: toBase64(nonce),
      ciphertext: toBase64(ciphertextBytes),
      authTag: toBase64(authTagBytes),
    });
  }

  return {
    dto: {
      files: encryptedFiles,
      encryptionMode: options.mode,
      kdfSalt: toBase64(salt),
      kdfIterations: iterations,
      wrappedKey: wrappedKeyStr,
      burnAfterReading: options.burnAfterReading,
      languageHint: options.languageHint,
    },
    linkKey,
  };
}

async function decryptFiles(
  files: Array<{ filename: string; nonce: string; ciphertext: string; authTag: string }>,
  cryptoKey: CryptoKey,
  pasteId?: string
): Promise<DecryptedFile[]> {
  const subtle = getSubtle();
  const id = pasteId ?? '';
  const result: DecryptedFile[] = [];

  for (const file of files) {
    const nonce = fromBase64(file.nonce);
    const authTag = fromBase64(file.authTag);
    const ciphertext = fromBase64(file.ciphertext);

    const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length);
    ciphertextWithTag.set(ciphertext, 0);
    ciphertextWithTag.set(authTag, ciphertext.length);

    const aad = new TextEncoder().encode(id + ':' + file.filename);

    let decryptedBuffer: ArrayBuffer;
    try {
      decryptedBuffer = await subtle.decrypt(
        { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad as BufferSource, tagLength: 128 },
        cryptoKey,
        ciphertextWithTag as BufferSource
      );
    } catch {
      if (id !== '') {
        try {
          const fallbackAad = new TextEncoder().encode(':' + file.filename);
          decryptedBuffer = await subtle.decrypt(
            { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: fallbackAad as BufferSource, tagLength: 128 },
            cryptoKey,
            ciphertextWithTag as BufferSource
          );
        } catch {
          throw new DecryptionFailedError();
        }
      } else {
        throw new DecryptionFailedError();
      }
    }

    const bytes = new Uint8Array(decryptedBuffer);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    result.push({
      filename: file.filename,
      bytes,
      text,
    });
  }

  return result;
}

export async function decryptPaste(
  paste: EncryptedPasteViewDTO,
  credential: string | Uint8Array
): Promise<DecryptedFile[]> {
  if (!paste) {
    throw new CryptoValidationError('Paste view DTO is required');
  }
  if (!Array.isArray(paste.files) || paste.files.length === 0) {
    throw new CryptoValidationError('Files array must not be empty');
  }

  // Pre-validate file fields structurally
  for (const file of paste.files) {
    const nonce = fromBase64(file.nonce);
    if (nonce.length !== 12) {
      throw new CryptoValidationError('File nonce must be exactly 12 bytes');
    }
    const authTag = fromBase64(file.authTag);
    if (authTag.length !== 16) {
      throw new CryptoValidationError('File authTag must be exactly 16 bytes');
    }
    const ciphertext = fromBase64(file.ciphertext);
    if (ciphertext.length === 0) {
      throw new CryptoValidationError('File ciphertext must not be empty');
    }
  }

  if (paste.wrappedKey !== null) {
    const wrappedBytes = fromBase64(paste.wrappedKey);
    if (wrappedBytes.length !== 60) {
      throw new CryptoValidationError('Wrapped key must be exactly 60 bytes');
    }
  }

  let iterations = 0;
  if (paste.encryptionMode === 'PASSPHRASE' || paste.wrappedKey !== null) {
    if (paste.kdfIterations === null || paste.kdfIterations < 600000 || paste.kdfIterations > 2000000) {
      throw new InvalidKdfParametersError();
    }
    iterations = paste.kdfIterations;
  }

  const subtle = getSubtle();

  // Mode 1: PASSPHRASE Mode
  if (paste.encryptionMode === 'PASSPHRASE') {
    // If a 32-byte raw link key is passed, reject with CryptoValidationError
    if (credential instanceof Uint8Array && credential.length === 32) {
      throw new CryptoValidationError('Link keys cannot be used for PASSPHRASE mode pastes');
    }
    if (typeof credential === 'string') {
      try {
        const decoded = fromUrlSafeBase64(credential);
        if (decoded.length === 32) {
          throw new CryptoValidationError('Link keys cannot be used for PASSPHRASE mode pastes');
        }
      } catch (e) {
        if (e instanceof CryptoValidationError && e.message.includes('Link keys cannot be used')) {
          throw e;
        }
      }
    }

    const salt = fromBase64(paste.kdfSalt);
    if (salt.length !== 16) {
      throw new CryptoValidationError('KDF salt must be exactly 16 bytes');
    }

    const passphrase = typeof credential === 'string' ? credential : new TextDecoder().decode(credential);
    const cryptoKey = await deriveKeyFromPassphrase(passphrase, salt, iterations);
    return decryptFiles(paste.files, cryptoKey, paste.id);
  }

  // Mode 2: LINK Mode (Raw Link Key, wrappedKey === null)
  if (paste.encryptionMode === 'LINK' && paste.wrappedKey === null) {
    let keyBytes: Uint8Array;
    if (credential instanceof Uint8Array) {
      keyBytes = credential;
    } else if (typeof credential === 'string') {
      keyBytes = fromUrlSafeBase64(credential);
    } else {
      throw new CryptoValidationError('Invalid credential type for LINK mode');
    }

    if (keyBytes.length !== 32) {
      throw new CryptoValidationError('Link key must be exactly 32 bytes');
    }

    const cryptoKey = await subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    return decryptFiles(paste.files, cryptoKey, paste.id);
  }

  // Mode 3: LINK Mode (Passphrase-Wrapped, Dual Access, wrappedKey !== null)
  if (paste.encryptionMode === 'LINK' && paste.wrappedKey !== null) {
    const wrappedKeyBytes = fromBase64(paste.wrappedKey);
    const salt = fromBase64(paste.kdfSalt);
    if (salt.length !== 16) {
      throw new CryptoValidationError('KDF salt must be exactly 16 bytes');
    }

    let directKeyBytes: Uint8Array | null = null;
    if (credential instanceof Uint8Array && credential.length === 32) {
      directKeyBytes = credential;
    } else if (typeof credential === 'string') {
      try {
        const decoded = fromUrlSafeBase64(credential);
        if (decoded.length === 32) {
          directKeyBytes = decoded;
        }
      } catch {
        // Not a valid 32-byte URL-safe base64 string
      }
    }

    if (directKeyBytes) {
      // Attempt direct master key decryption
      try {
        const directKey = await subtle.importKey(
          'raw',
          directKeyBytes as BufferSource,
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );
        return await decryptFiles(paste.files, directKey, paste.id);
      } catch (directErr) {
        // Direct key failed; if credential is string, attempt passphrase unwrap
        if (typeof credential === 'string') {
          try {
            const unwrappedKeyBytes = await unwrapMasterKey(wrappedKeyBytes, credential, salt, iterations);
            const unwrappedKey = await subtle.importKey(
              'raw',
              unwrappedKeyBytes as BufferSource,
              { name: 'AES-GCM' },
              false,
              ['decrypt']
            );
            return await decryptFiles(paste.files, unwrappedKey, paste.id);
          } catch {
            throw new DecryptionFailedError();
          }
        }
        throw new DecryptionFailedError();
      }
    } else {
      // Credential is a passphrase
      const passphrase = typeof credential === 'string' ? credential : new TextDecoder().decode(credential);
      const unwrappedKeyBytes = await unwrapMasterKey(wrappedKeyBytes, passphrase, salt, iterations);
      const unwrappedKey = await subtle.importKey(
        'raw',
        unwrappedKeyBytes as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      return decryptFiles(paste.files, unwrappedKey, paste.id);
    }
  }

  throw new CryptoValidationError(`Unsupported paste encryption mode: ${paste.encryptionMode}`);
}
