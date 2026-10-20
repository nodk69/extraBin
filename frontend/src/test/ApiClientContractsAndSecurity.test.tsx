import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pasteApi } from '../features/pastes/api/pasteApi';
import { replyApi, type ReplyQueryOptions } from '../features/pastes/api/replyApi';
import { folderApi } from '../features/pastes/api/folderApi';
import { apiClient, ApiError } from '../lib/api-client/client';

describe('Phase 2 Red Suite: ExtraBin API Clients Hardening & Security Contracts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Header-Only Programmatic Token Transport & De-duplication
  // =========================================================================
  it('TEST-TRANS-01: getPaste sends X-Share-Token header and does not duplicate token in query parameters', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { id: 'pasteUnl1', visibility: 'UNLISTED' },
    });

    await pasteApi.getPaste('pasteUnl1', undefined, false, 'shr_secureShareToken12345');

    expect(getSpy).toHaveBeenCalledTimes(1);
    const [url, config]: [any, any] = getSpy.mock.calls[0] as any;
    expect(url).toBe('/pastes/pasteUnl1');
    expect(config?.headers?.['X-Share-Token']).toBe('shr_secureShareToken12345');
    // Query param must NOT leak the share token for programmatic client calls
    expect(config?.params?.token).toBeUndefined();
  });

  it('TEST-TRANS-02: getPaste sends X-Skip-View-Count header and does not duplicate in query params', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { id: 'paste1' },
    });

    await pasteApi.getPaste('paste1', undefined, true);

    expect(getSpy).toHaveBeenCalledTimes(1);
    const [, config]: [any, any] = getSpy.mock.calls[0] as any;
    expect(config?.headers?.['X-Skip-View-Count']).toBe('true');
    expect(config?.params?.skipViewCount).toBeUndefined();
  });

  it('TEST-TRANS-03: getPaste handles omitted or undefined share token cleanly without sending header', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { id: 'pastePub1' },
    });

    await pasteApi.getPaste('pastePub1');

    expect(getSpy).toHaveBeenCalledTimes(1);
    const [, config]: [any, any] = getSpy.mock.calls[0] as any;
    expect(config?.headers?.['X-Share-Token']).toBeUndefined();
    expect(config?.params?.token).toBeUndefined();
  });

  // =========================================================================
  // 2. downloadZip Token Transport & Resilient ProblemDetails Blob Error Parsing
  // =========================================================================
  it('TEST-ZIP-01: downloadZip sends X-Share-Token header when unlisted token is provided', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: new Blob(['mock-zip-binary'], { type: 'application/zip' }),
    });

    // downloadZip signature must accept (id, password?, token?)
    await (pasteApi as any).downloadZip('pasteUnl1', 'pass123', 'shr_secureShareToken12345');

    expect(getSpy).toHaveBeenCalledTimes(1);
    const [url, config]: [any, any] = getSpy.mock.calls[0] as any;
    expect(url).toBe('/pastes/pasteUnl1/download-zip');
    expect(config?.headers?.['X-Paste-Password']).toBe('pass123');
    expect(config?.headers?.['X-Share-Token']).toBe('shr_secureShareToken12345');
    expect(config?.params?.token).toBeUndefined();
  });

  it('TEST-ZIP-02: downloadZip decodes RFC 9457 ProblemDetail when server returns JSON error in Blob', async () => {
    const problemJson = JSON.stringify({
      title: 'Password Required',
      status: 401,
      detail: 'This paste requires a passcode to download.',
      properties: { code: 'AUTHENTICATION_REQUIRED' },
    });
    const errorBlob = new Blob([problemJson], { type: 'application/problem+json' });

    // Simulate Axios error rejecting with a Blob response
    const axiosError: any = new Error('Request failed with status code 401');
    axiosError.isAxiosError = true;
    axiosError.response = {
      status: 401,
      statusText: 'Unauthorized',
      data: errorBlob,
      headers: { 'content-type': 'application/problem+json' },
    };

    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(axiosError);

    let thrownError: any = null;
    try {
      await (pasteApi as any).downloadZip('pasteLocked');
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ApiError);
    expect(thrownError.status).toBe(401);
    expect(thrownError.detail).toBe('This paste requires a passcode to download.');
    expect(thrownError.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('TEST-ZIP-03: downloadZip handles non-JSON or empty error blobs gracefully with fallback ApiError', async () => {
    const nonJsonBlob = new Blob(['<html>502 Bad Gateway</html>'], { type: 'text/html' });
    const axiosError: any = new Error('Request failed with status code 502');
    axiosError.isAxiosError = true;
    axiosError.response = {
      status: 502,
      statusText: 'Bad Gateway',
      data: nonJsonBlob,
      headers: { 'content-type': 'text/html' },
    };

    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(axiosError);

    let thrownError: any = null;
    try {
      await (pasteApi as any).downloadZip('pasteBroken');
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ApiError);
    expect(thrownError.status).toBe(502);
  });

  // =========================================================================
  // 3. replyApi Options Object, Positional Overload & Cursor Semantics
  // =========================================================================
  it('TEST-REP-01: getReplies supports options object with X-Share-Token and X-Paste-Password headers', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { items: [], nextCursor: null, hasMore: false },
    });

    const options: ReplyQueryOptions = {
      cursor: '105',
      limit: 15,
      token: 'shr_replyToken123',
      password: 'pastePassword456',
    };

    await (replyApi as any).getReplies('paste1', options);

    expect(getSpy).toHaveBeenCalledTimes(1);
    const [url, config]: [any, any] = getSpy.mock.calls[0] as any;
    expect(url).toBe('/pastes/paste1/replies');
    expect(config?.params?.cursor).toBe('105');
    expect(config?.params?.limit).toBe(15);
    expect(config?.headers?.['X-Share-Token']).toBe('shr_replyToken123');
    expect(config?.headers?.['X-Paste-Password']).toBe('pastePassword456');
  });

  it('TEST-REP-02: getReplies preserves legacy positional arguments (pasteId, cursor, limit)', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { items: [], nextCursor: null, hasMore: false },
    });

    await replyApi.getReplies('paste1', '200', 30);

    expect(getSpy).toHaveBeenCalledTimes(1);
    const [, config]: [any, any] = getSpy.mock.calls[0] as any;
    expect(config?.params?.cursor).toBe('200');
    expect(config?.params?.limit).toBe(30);
  });

  it('TEST-REP-03: getReplies safely clamps limit for decimal, negative, NaN, Infinity, and excessive limits', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { items: [], nextCursor: null, hasMore: false },
    });

    // 1. Excessive limit clamped to 50
    await (replyApi as any).getReplies('paste1', { limit: 999 });
    expect((getSpy.mock.calls[0] as any)[1]?.params?.limit).toBe(50);

    // 2. Negative limit clamped to 1
    await (replyApi as any).getReplies('paste1', { limit: -10 });
    expect((getSpy.mock.calls[1] as any)[1]?.params?.limit).toBe(1);

    // 3. Decimal limit coerced to floor integer
    await (replyApi as any).getReplies('paste1', { limit: 25.8 });
    expect((getSpy.mock.calls[2] as any)[1]?.params?.limit).toBe(25);

    // 4. NaN coerced to default 20
    await (replyApi as any).getReplies('paste1', { limit: NaN });
    expect((getSpy.mock.calls[3] as any)[1]?.params?.limit).toBe(20);

    // 5. Infinity coerced to max 50
    await (replyApi as any).getReplies('paste1', { limit: Infinity });
    expect((getSpy.mock.calls[4] as any)[1]?.params?.limit).toBe(50);
  });

  it('TEST-REP-04: getReplies preserves null cursor distinct from omitted cursor', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { items: [], nextCursor: null, hasMore: false },
    });

    // When cursor is explicitly null (initial page load), params should not have cursor or should omit safely
    await (replyApi as any).getReplies('paste1', { cursor: null });
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect((getSpy.mock.calls[0] as any)[1]?.params?.cursor).toBeUndefined();
  });

  it('TEST-REP-05: createReply supports mutation options with X-Share-Token header', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { id: 1, content: 'Nice reply' },
    });

    await (replyApi as any).createReply(
      'paste1',
      { content: 'Nice reply' },
      { token: 'shr_replyToken123' }
    );

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, payload, config] = postSpy.mock.calls[0];
    expect(url).toBe('/pastes/paste1/replies');
    expect(payload).toEqual({ content: 'Nice reply' });
    expect(config?.headers?.['X-Share-Token']).toBe('shr_replyToken123');
  });

  // =========================================================================
  // 4. Single-Transport Deletion Capability & Header Primary
  // =========================================================================
  it('TEST-DEL-01: deleteComment sends capability exclusively via X-Comment-Delete-Token header', async () => {
    const delSpy = vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({ data: null });

    await pasteApi.deleteComment('paste1', 101, 'del_commentSecret123');

    expect(delSpy).toHaveBeenCalledTimes(1);
    const [url, config] = delSpy.mock.calls[0];
    expect(url).toBe('/pastes/paste1/comments/101');
    expect(config?.headers?.['X-Comment-Delete-Token']).toBe('del_commentSecret123');
    // Body must NOT duplicate the deletion capability
    expect(config?.data).toBeUndefined();
  });

  it('TEST-DEL-02: deleteComment without capability sends no deletion header', async () => {
    const delSpy = vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({ data: null });

    await pasteApi.deleteComment('paste1', 101);

    expect(delSpy).toHaveBeenCalledTimes(1);
    const [, config] = delSpy.mock.calls[0];
    expect(config?.headers?.['X-Comment-Delete-Token']).toBeUndefined();
  });

  // =========================================================================
  // 5. Segment-by-Segment Path Encoding Without Silent Mutation
  // =========================================================================
  it('TEST-URL-01: raw and download helpers encode individual path segments and preserve identifiers without trimming', () => {
    const rawFileUrl = pasteApi.getRawFileUrl('paste 1#alpha', 'file?name/sub.ts', 'shr_tok1');
    // Must encode path segments separately without losing special characters
    expect(rawFileUrl).toContain('/pastes/paste%201%23alpha/files/file%3Fname%2Fsub.ts/raw');
    expect(rawFileUrl).toContain('?token=shr_tok1');

    const rawUrl = pasteApi.getRawUrl('paste/with/slashes');
    expect(rawUrl).toBe('/api/v1/pastes/paste%2Fwith%2Fslashes/raw');
  });

  it('TEST-URL-02: raw helpers reject empty or invalid identifiers', () => {
    expect(() => (pasteApi as any).getRawUrl('')).toThrow(Error);
  });

  // =========================================================================
  // 6. Client-Side Folder Validation Matching Backend Constraints
  // =========================================================================
  it('TEST-DIR-01: folderApi.createFolder rejects blank, oversized (101 UTF-16 units), or control-character folder names with ApiError', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');

    // 1. Blank / whitespace-only name
    await expect(folderApi.createFolder('   ')).rejects.toThrow(ApiError);
    expect(postSpy).not.toHaveBeenCalled();

    // 2. Oversized name (> 100 UTF-16 code units)
    const longName = 'a'.repeat(101);
    await expect(folderApi.createFolder(longName)).rejects.toThrow(ApiError);
    expect(postSpy).not.toHaveBeenCalled();

    // 3. Exactly 100 characters should NOT be rejected by client validation
    postSpy.mockResolvedValueOnce({ data: { id: 1, name: 'a'.repeat(100) } } as any);
    await expect(folderApi.createFolder('a'.repeat(100))).resolves.toBeDefined();
    expect(postSpy).toHaveBeenCalledTimes(1);

    // 4. Control character (ASCII < 32 or 127)
    const controlName = 'folder\u0007test';
    await expect(folderApi.createFolder(controlName)).rejects.toThrow(ApiError);
  });

  it('TEST-DIR-02: folderApi.renameFolder validates folder name client-side before network dispatch', async () => {
    const putSpy = vi.spyOn(apiClient, 'put');

    await expect(folderApi.renameFolder(1, '')).rejects.toThrow(ApiError);
    expect(putSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 7. Structured Secret Redaction
  // =========================================================================
  it('TEST-LOG-01: sanitizeLogData redacts query tokens, passwords, deletion keys, and #key= fragments while preserving surrounding text', () => {
    const sample = [
      'Failed fetch: https://extrabin.local/p/abc12345?token=shr_secretToken999&theme=dark',
      'Headers sent: X-Paste-Password: mySecretPasscode!',
      'Headers sent: X-Comment-Delete-Token: del_deletionKey123',
      'Client fragment: https://extrabin.local/p/xyz#key=superSecretAesKey123',
    ].join('\n');

    const sanitized = pasteApi.sanitizeLogData(sample);

    expect(sanitized).not.toContain('shr_secretToken999');
    expect(sanitized).not.toContain('mySecretPasscode!');
    expect(sanitized).not.toContain('del_deletionKey123');
    expect(sanitized).not.toContain('superSecretAesKey123');

    // Surrounding text must be preserved
    expect(sanitized).toContain('theme=dark');
    expect(sanitized).toContain('Headers sent: X-Paste-Password: [REDACTED]');
    expect(sanitized).toContain('Headers sent: X-Comment-Delete-Token: [REDACTED]');
    expect(sanitized).toContain('token=[REDACTED_TOKEN]');
    expect(sanitized).toContain('#key=[REDACTED_KEY]');
  });
});
