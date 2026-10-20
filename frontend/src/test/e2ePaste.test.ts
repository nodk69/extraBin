import { describe, it, expect } from 'vitest';
import {
  generateMasterKey,
  encryptPaste,
  decryptPaste,
  toBase64,
  fromBase64,
  toUrlSafeBase64,
  DecryptionFailedError,
  InvalidKdfParametersError,
  CryptoValidationError,
  type InputFile,
  type EncryptedPasteViewDTO,
} from '../lib/crypto/e2ePaste';

describe('e2ePaste Cryptographic Engine', { timeout: 20000 }, () => {

  // --- A. Functional & Round-Trip Tests ---

  it('1. generateMasterKey_produces32RandomBytes', () => {
    const key = generateMasterKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
    const key2 = generateMasterKey();
    expect(key).not.toEqual(key2);
  });

  it('2. roundtrip_linkMode_raw_singleFileText', async () => {
    const files: InputFile[] = [{ filename: 'secret.txt', data: 'Confidential project plan' }];
    const encrypted = await encryptPaste(files, { mode: 'LINK', pasteId: 'paste-1' });
    expect(encrypted.linkKey).toBeDefined();

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'paste-1',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    const decrypted = await decryptPaste(viewDTO, encrypted.linkKey!);
    expect(decrypted).toHaveLength(1);
    expect(decrypted[0].filename).toBe('secret.txt');
    expect(decrypted[0].text).toBe('Confidential project plan');
  });

  it('3. roundtrip_linkMode_raw_multiFile', async () => {
    const files: InputFile[] = [
      { filename: 'f1.ts', data: 'const a = 1;' },
      { filename: 'f2.ts', data: 'const b = 2;' },
      { filename: 'f3.ts', data: 'export default a + b;' },
    ];
    const encrypted = await encryptPaste(files, { mode: 'LINK', pasteId: 'multi-paste' });

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'multi-paste',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    const decrypted = await decryptPaste(viewDTO, encrypted.linkKey!);
    expect(decrypted).toHaveLength(3);
    expect(decrypted[0].text).toBe('const a = 1;');
    expect(decrypted[1].text).toBe('const b = 2;');
    expect(decrypted[2].text).toBe('export default a + b;');
  });

  it('4. roundtrip_linkMode_passphraseWrapped_singleFile', async () => {
    const files: InputFile[] = [{ filename: 'wrapped.txt', data: 'Wrapped secret text' }];
    const passphrase = 'SuperSecretPassphrase123!';
    const encrypted = await encryptPaste(files, { mode: 'LINK', passphrase, pasteId: 'paste-wrapped' });
    expect(encrypted.dto.wrappedKey).not.toBeNull();

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'paste-wrapped',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: encrypted.dto.wrappedKey,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    // Decrypt using passphrase to unwrap master key
    const decrypted = await decryptPaste(viewDTO, passphrase);
    expect(decrypted).toHaveLength(1);
    expect(decrypted[0].text).toBe('Wrapped secret text');
  });

  it('5. linkMode_passphraseWrapped_dualAccess_canDecryptWithLinkKeyOrPassphrase', async () => {
    const files: InputFile[] = [{ filename: 'wrapped.txt', data: 'Wrapped secret text' }];
    const passphrase = 'SuperSecretPassphrase123!';
    const encrypted = await encryptPaste(files, { mode: 'LINK', passphrase, pasteId: 'p-wrap' });

    // Dual-access: linkKey IS returned for URL fragment, AND wrappedKey is stored on server
    expect(encrypted.linkKey).toBeDefined();
    expect(encrypted.dto.wrappedKey).not.toBeNull();

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p-wrap',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: encrypted.dto.wrappedKey,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    // Path 1: Recipient decrypts using raw link key from URL fragment
    const decryptedViaLinkKey = await decryptPaste(viewDTO, encrypted.linkKey!);
    expect(decryptedViaLinkKey[0].text).toBe('Wrapped secret text');

    // Path 2: Recipient decrypts using passphrase (unwrapping wrappedKey)
    const decryptedViaPassphrase = await decryptPaste(viewDTO, passphrase);
    expect(decryptedViaPassphrase[0].text).toBe('Wrapped secret text');
  });

  it('6. roundtrip_passphraseMode_singleFileText', async () => {
    const files: InputFile[] = [{ filename: 'notes.md', data: '# Top Secret Notes' }];
    const passphrase = 'MyMasterPassphrase!456';
    const encrypted = await encryptPaste(files, { mode: 'PASSPHRASE', passphrase, pasteId: 'paste-pass' });
    expect(encrypted.dto.wrappedKey).toBeNull();
    expect(encrypted.linkKey).toBeUndefined();

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'paste-pass',
      encryptionMode: 'PASSPHRASE',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    const decrypted = await decryptPaste(viewDTO, passphrase);
    expect(decrypted[0].text).toBe('# Top Secret Notes');
  });

  it('7. roundtrip_passphraseMode_multiFile', async () => {
    const files: InputFile[] = [
      { filename: 'doc1.txt', data: 'Content 1' },
      { filename: 'doc2.txt', data: 'Content 2' },
    ];
    const passphrase = 'MyMasterPassphrase!456';
    const encrypted = await encryptPaste(files, { mode: 'PASSPHRASE', passphrase, pasteId: 'paste-pass-multi' });

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'paste-pass-multi',
      encryptionMode: 'PASSPHRASE',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    const decrypted = await decryptPaste(viewDTO, passphrase);
    expect(decrypted).toHaveLength(2);
    expect(decrypted[0].text).toBe('Content 1');
    expect(decrypted[1].text).toBe('Content 2');
  });

  it('8. roundtrip_binaryData_preservesExactBytes', async () => {
    const binaryData = new Uint8Array([0x00, 0xFF, 0xFE, 0x80, 0xC0, 0xAF, 0x1B, 0x07, 0x42]);
    const files: InputFile[] = [{ filename: 'data.bin', data: binaryData }];

    const encrypted = await encryptPaste(files, { mode: 'LINK', pasteId: 'paste-bin' });
    const viewDTO: EncryptedPasteViewDTO = {
      id: 'paste-bin',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    const decrypted = await decryptPaste(viewDTO, encrypted.linkKey!);
    expect(decrypted[0].bytes).toEqual(binaryData);
  });

  // --- B. Serialization & DTO Shape Verification ---

  it('9. encrypt_linkMode_raw_dtoShapeMatchesBackend', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'hello' }];
    const res = await encryptPaste(files, { mode: 'LINK' });

    expect(res.dto.encryptionMode).toBe('LINK');
    expect(res.dto.wrappedKey).toBeNull();
    expect(fromBase64(res.dto.kdfSalt)).toHaveLength(16);
    expect(res.dto.kdfIterations).toBe(600000);
    expect(res.dto.files).toHaveLength(1);
    expect(fromBase64(res.dto.files[0].nonce)).toHaveLength(12);
    expect(fromBase64(res.dto.files[0].authTag)).toHaveLength(16);
    expect(fromBase64(res.dto.files[0].ciphertext).length).toBeGreaterThan(0);
    expect(res.linkKey).toBeDefined();
  });

  it('10. encrypt_linkMode_wrapped_dtoShapeMatchesBackend', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'hello' }];
    const res = await encryptPaste(files, { mode: 'LINK', passphrase: 'Pass' });

    expect(res.dto.encryptionMode).toBe('LINK');
    expect(res.dto.wrappedKey).not.toBeNull();
    expect(fromBase64(res.dto.wrappedKey!)).toHaveLength(60);
    expect(res.linkKey).toBeDefined();
  });

  it('11. encrypt_passphraseMode_dtoShapeMatchesBackend', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'hello' }];
    const res = await encryptPaste(files, { mode: 'PASSPHRASE', passphrase: 'Pass' });

    expect(res.dto.encryptionMode).toBe('PASSPHRASE');
    expect(res.dto.wrappedKey).toBeNull();
    expect(res.linkKey).toBeUndefined();
  });

  it('12. multiFile_distinctNoncesAcrossFiles', async () => {
    const files: InputFile[] = Array.from({ length: 10 }, (_, i) => ({
      filename: `file_${i}.txt`,
      data: `Content ${i}`,
    }));
    const res = await encryptPaste(files, { mode: 'LINK' });

    const nonceSet = new Set(res.dto.files.map((f) => f.nonce));
    expect(nonceSet.size).toBe(10);
  });

  // --- C. Authentication & Tampering Resistance (with length guards) ---

  it('13. tamperedCiphertext_throwsDecryptionFailedError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Untampered' }];
    const encrypted = await encryptPaste(files, { mode: 'LINK', pasteId: 'p1' });

    const ctBytes = fromBase64(encrypted.dto.files[0].ciphertext);
    expect(ctBytes.length).toBeGreaterThanOrEqual(1);
    ctBytes[0] ^= 0x01;
    const tamperedCt = toBase64(ctBytes);

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: [{
        filename: 'test.txt',
        nonce: encrypted.dto.files[0].nonce,
        ciphertext: tamperedCt,
        authTag: encrypted.dto.files[0].authTag,
      }],
    };

    await expect(decryptPaste(viewDTO, encrypted.linkKey!)).rejects.toThrow(DecryptionFailedError);
  });

  it('14. tamperedAuthTag_throwsDecryptionFailedError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Untampered' }];
    const encrypted = await encryptPaste(files, { mode: 'LINK', pasteId: 'p1' });

    const tagBytes = fromBase64(encrypted.dto.files[0].authTag);
    expect(tagBytes.length).toBeGreaterThanOrEqual(16);
    tagBytes[0] ^= 0x01;
    const tamperedTag = toBase64(tagBytes);

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: [{
        filename: 'test.txt',
        nonce: encrypted.dto.files[0].nonce,
        ciphertext: encrypted.dto.files[0].ciphertext,
        authTag: tamperedTag,
      }],
    };

    await expect(decryptPaste(viewDTO, encrypted.linkKey!)).rejects.toThrow(DecryptionFailedError);
  });

  it('15. tamperedNonce_throwsDecryptionFailedError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Untampered' }];
    const encrypted = await encryptPaste(files, { mode: 'LINK', pasteId: 'p1' });

    const nonceBytes = fromBase64(encrypted.dto.files[0].nonce);
    expect(nonceBytes.length).toBeGreaterThanOrEqual(12);
    nonceBytes[0] ^= 0x01;
    const tamperedNonce = toBase64(nonceBytes);

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: [{
        filename: 'test.txt',
        nonce: tamperedNonce,
        ciphertext: encrypted.dto.files[0].ciphertext,
        authTag: encrypted.dto.files[0].authTag,
      }],
    };

    await expect(decryptPaste(viewDTO, encrypted.linkKey!)).rejects.toThrow(DecryptionFailedError);
  });

  it('16. tamperedSalt_throwsDecryptionFailedError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    const passphrase = 'CorrectPassphrase!';
    const encrypted = await encryptPaste(files, { mode: 'PASSPHRASE', passphrase, pasteId: 'p1' });

    const saltBytes = fromBase64(encrypted.dto.kdfSalt);
    expect(saltBytes.length).toBeGreaterThanOrEqual(16);
    saltBytes[0] ^= 0x01;
    const tamperedSalt = toBase64(saltBytes);

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'PASSPHRASE',
      kdfSalt: tamperedSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    await expect(decryptPaste(viewDTO, passphrase)).rejects.toThrow(DecryptionFailedError);
  });

  it('17. tamperedWrappedKeyCiphertext_throwsDecryptionFailedError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    const passphrase = 'CorrectPassphrase!';
    const encrypted = await encryptPaste(files, { mode: 'LINK', passphrase, pasteId: 'p1' });

    const wrappedBytes = fromBase64(encrypted.dto.wrappedKey!);
    expect(wrappedBytes.length).toBeGreaterThanOrEqual(44);
    wrappedBytes[20] ^= 0x01;
    const tamperedWrapped = toBase64(wrappedBytes);

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: tamperedWrapped,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    await expect(decryptPaste(viewDTO, passphrase)).rejects.toThrow(DecryptionFailedError);
  });

  it('18. tamperedWrappedKeyTag_throwsDecryptionFailedError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    const passphrase = 'CorrectPassphrase!';
    const encrypted = await encryptPaste(files, { mode: 'LINK', passphrase, pasteId: 'p1' });

    const wrappedBytes = fromBase64(encrypted.dto.wrappedKey!);
    expect(wrappedBytes.length).toBeGreaterThanOrEqual(60);
    wrappedBytes[55] ^= 0x01;
    const tamperedWrapped = toBase64(wrappedBytes);

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: tamperedWrapped,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    await expect(decryptPaste(viewDTO, passphrase)).rejects.toThrow(DecryptionFailedError);
  });

  // --- D. Wrong Credentials & Cross-Product Tests ---

  it('19. wrongPassphrase_passphraseMode_throwsDecryptionFailedError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    const encrypted = await encryptPaste(files, { mode: 'PASSPHRASE', passphrase: 'RightPassword', pasteId: 'p1' });

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'PASSPHRASE',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    await expect(decryptPaste(viewDTO, 'WrongPassword')).rejects.toThrow(DecryptionFailedError);
  });

  it('20. wrongPassphrase_wrappedLinkMode_throwsDecryptionFailedError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    const encrypted = await encryptPaste(files, { mode: 'LINK', passphrase: 'RightPassword', pasteId: 'p1' });

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: encrypted.dto.wrappedKey,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    await expect(decryptPaste(viewDTO, 'WrongPassword')).rejects.toThrow(DecryptionFailedError);
  });

  it('21. wrongLinkKey_rawLinkMode_throwsDecryptionFailedError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    const encrypted = await encryptPaste(files, { mode: 'LINK', pasteId: 'p1' });

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    const wrongKey = toUrlSafeBase64(new Uint8Array(32).fill(0x42));
    await expect(decryptPaste(viewDTO, wrongKey)).rejects.toThrow(DecryptionFailedError);
  });

  it('22. linkMode_wrappedMode_wrongLinkKey_throwsDecryptionFailedError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    const encrypted = await encryptPaste(files, { mode: 'LINK', passphrase: 'RightPassphrase', pasteId: 'p1' });

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: encrypted.dto.wrappedKey,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    // Passing a raw link key to wrapped mode fails unwrap
    const dummyKey = toUrlSafeBase64(new Uint8Array(32).fill(0x99));
    await expect(decryptPaste(viewDTO, dummyKey)).rejects.toThrow(DecryptionFailedError);
  });

  it('23. passphraseMode_linkKeyPassed_throwsValidationError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    const encrypted = await encryptPaste(files, { mode: 'PASSPHRASE', passphrase: 'RightPassphrase', pasteId: 'p1' });

    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'PASSPHRASE',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    // Passing a raw link key (32-byte base64url string) to a PASSPHRASE mode paste throws CryptoValidationError
    const rawLinkKey = toUrlSafeBase64(new Uint8Array(32).fill(0xAA));
    await expect(decryptPaste(viewDTO, rawLinkKey)).rejects.toThrow(CryptoValidationError);
  });

  // --- E. Malformed Input & Truncation ---

  it('24. malformedBase64_throwsValidationError', () => {
    expect(() => fromBase64('!!!NOT_BASE64@@@')).toThrow(CryptoValidationError);
  });

  it('25. fromBase64_emptyString_returnsEmptyUint8Array', () => {
    const res = fromBase64('');
    expect(res).toBeInstanceOf(Uint8Array);
    expect(res.length).toBe(0);
  });

  it('26. truncatedNonce_throwsValidationError', async () => {
    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: toBase64(new Uint8Array(16)),
      kdfIterations: 600000,
      wrappedKey: null,
      burnAfterReading: false,
      files: [{
        filename: 'test.txt',
        nonce: toBase64(new Uint8Array(8)), // invalid: 8 bytes instead of 12
        ciphertext: toBase64(new Uint8Array(10)),
        authTag: toBase64(new Uint8Array(16)),
      }],
    };

    await expect(decryptPaste(viewDTO, toUrlSafeBase64(new Uint8Array(32)))).rejects.toThrow(CryptoValidationError);
  });

  it('27. truncatedAuthTag_throwsValidationError', async () => {
    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: toBase64(new Uint8Array(16)),
      kdfIterations: 600000,
      wrappedKey: null,
      burnAfterReading: false,
      files: [{
        filename: 'test.txt',
        nonce: toBase64(new Uint8Array(12)),
        ciphertext: toBase64(new Uint8Array(10)),
        authTag: toBase64(new Uint8Array(12)), // invalid: 12 bytes instead of 16
      }],
    };

    await expect(decryptPaste(viewDTO, toUrlSafeBase64(new Uint8Array(32)))).rejects.toThrow(CryptoValidationError);
  });

  it('28. truncatedWrappedKey_throwsValidationError', async () => {
    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: toBase64(new Uint8Array(16)),
      kdfIterations: 600000,
      wrappedKey: toBase64(new Uint8Array(59)), // invalid: 59 bytes instead of 60
      burnAfterReading: false,
      files: [{
        filename: 'test.txt',
        nonce: toBase64(new Uint8Array(12)),
        ciphertext: toBase64(new Uint8Array(10)),
        authTag: toBase64(new Uint8Array(16)),
      }],
    };

    await expect(decryptPaste(viewDTO, 'passphrase')).rejects.toThrow(CryptoValidationError);
  });

  it('29. emptyCiphertext_throwsValidationError', async () => {
    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: toBase64(new Uint8Array(16)),
      kdfIterations: 600000,
      wrappedKey: null,
      burnAfterReading: false,
      files: [{
        filename: 'test.txt',
        nonce: toBase64(new Uint8Array(12)),
        ciphertext: '', // invalid: empty ciphertext
        authTag: toBase64(new Uint8Array(16)),
      }],
    };

    await expect(decryptPaste(viewDTO, toUrlSafeBase64(new Uint8Array(32)))).rejects.toThrow(CryptoValidationError);
  });

  it('30. invalidKeyLength_throwsValidationError', async () => {
    const viewDTO: EncryptedPasteViewDTO = {
      id: 'p1',
      encryptionMode: 'LINK',
      kdfSalt: toBase64(new Uint8Array(16)),
      kdfIterations: 600000,
      wrappedKey: null,
      burnAfterReading: false,
      files: [{
        filename: 'test.txt',
        nonce: toBase64(new Uint8Array(12)),
        ciphertext: toBase64(new Uint8Array(10)),
        authTag: toBase64(new Uint8Array(16)),
      }],
    };

    // 16 bytes key instead of 32
    const shortKey = toUrlSafeBase64(new Uint8Array(16));
    await expect(decryptPaste(viewDTO, shortKey)).rejects.toThrow(CryptoValidationError);
  });

  // --- F. Boundary Values & Abuse Resistance ---

  it('31. emptyPassphrase_throwsValidationError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    await expect(encryptPaste(files, { mode: 'PASSPHRASE', passphrase: '' })).rejects.toThrow(CryptoValidationError);
    await expect(encryptPaste(files, { mode: 'PASSPHRASE', passphrase: '   ' })).rejects.toThrow(CryptoValidationError);
  });

  it('32. kdfIterationsBelowMinimum_throwsInvalidKdfParametersError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    await expect(encryptPaste(files, { mode: 'PASSPHRASE', passphrase: 'Pass', iterations: 100000 }))
      .rejects.toThrow(InvalidKdfParametersError);
  });

  it('33. kdfIterationsAboveMaximum_throwsInvalidKdfParametersError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    await expect(encryptPaste(files, { mode: 'PASSPHRASE', passphrase: 'Pass', iterations: 5000000 }))
      .rejects.toThrow(InvalidKdfParametersError);
  });

  it('34. unsupportedEncryptionMode_throwsValidationError', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret' }];
    // @ts-expect-error Testing invalid runtime mode
    await expect(encryptPaste(files, { mode: 'UNSUPPORTED' })).rejects.toThrow(CryptoValidationError);
  });

  it('35. emptyFilesArray_throwsValidationError', async () => {
    await expect(encryptPaste([], { mode: 'LINK' })).rejects.toThrow(CryptoValidationError);
  });

  // --- G. AAD (Additional Authenticated Data) Binding Defense ---

  it('36. mismatchedPasteId_aadRejectsDecryption', async () => {
    const files: InputFile[] = [{ filename: 'test.txt', data: 'Secret bound to paste ID' }];
    const encrypted = await encryptPaste(files, { mode: 'LINK', pasteId: 'paste-ALPHA' });

    // Attacker transplants ciphertext into paste-BETA
    const viewDTO: EncryptedPasteViewDTO = {
      id: 'paste-BETA', // Mismatched paste ID
      encryptionMode: 'LINK',
      kdfSalt: encrypted.dto.kdfSalt,
      kdfIterations: encrypted.dto.kdfIterations,
      wrappedKey: null,
      burnAfterReading: false,
      files: encrypted.dto.files.map((f) => ({
        filename: f.filenameHint,
        nonce: f.nonce,
        ciphertext: f.ciphertext,
        authTag: f.authTag,
      })),
    };

    // AAD mismatch breaks AES-GCM tag verification
    await expect(decryptPaste(viewDTO, encrypted.linkKey!)).rejects.toThrow(DecryptionFailedError);
  });
});
