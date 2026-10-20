import { apiClient, ApiError } from '../../../lib/api-client/client';
import { CreatePastePayload, CreatePasteResult, PasteView, RotateLinkResponse } from '../types/paste';
import type { CreateEncryptedPasteRequestDTO } from '../../../lib/crypto/e2ePaste';
import { buildCanonicalShareUrl } from '../lib/shareUrl';

/**
 * Turns a failed blob request into a readable RFC 9457 Problem Details error.
 *
 * A blob response cannot be parsed synchronously, so the error body is decoded
 * here; when the body is not a problem document the original transport error
 * is preserved.
 */
async function toBlobRequestError(err: any, fallbackDetail: string): Promise<Error> {
  const blob = err?.response?.data;
  if (blob && (blob instanceof Blob || typeof blob?.text === 'function' || typeof FileReader !== 'undefined')) {
    try {
      let text: string | undefined;
      if (typeof blob.text === 'function') {
        text = await blob.text();
      } else if (typeof FileReader !== 'undefined') {
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(blob);
        });
      }

      if (text) {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && ('status' in parsed || 'title' in parsed || 'detail' in parsed)) {
          return new ApiError({
            title: parsed.title || err.response.statusText || 'Error',
            status: parsed.status || err.response.status || 500,
            detail: parsed.detail || parsed.title || fallbackDetail,
            properties: parsed.properties,
            invalidParams: parsed.invalidParams,
          });
        }
      }
    } catch (parseErr) {
      if (parseErr instanceof ApiError) {
        return parseErr;
      }
      // If JSON parse fails, throw normalized ApiError with original status
      return new ApiError({
        title: err.response?.statusText || 'Download Error',
        status: err.response?.status || 500,
        detail: err.message || fallbackDetail,
      });
    }
  }
  return err;
}

export const pasteApi = {
  async createPaste(payload: CreatePastePayload): Promise<CreatePasteResult> {
    const response = await apiClient.post<CreatePasteResult>('/pastes', payload);
    return response.data;
  },

  async createEncryptedPaste(payload: CreateEncryptedPasteRequestDTO): Promise<CreatePasteResult> {
    const response = await apiClient.post<CreatePasteResult>('/pastes/encrypted', payload);
    return response.data;
  },

  async reportDecryptFailed(pasteId: string): Promise<void> {
    try {
      await apiClient.post(`/pastes/${pasteId}/decrypt-failed`);
    } catch {
      // Best-effort telemetry callback, ignore errors
    }
  },

  async getPaste(id: string, password?: string, skipViewCount?: boolean, token?: string): Promise<PasteView> {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    const headers: Record<string, string> = {};
    if (password) {
      headers['X-Paste-Password'] = password;
    }
    if (skipViewCount) {
      headers['X-Skip-View-Count'] = 'true';
    }
    if (token) {
      headers['X-Share-Token'] = token;
    }
    const config = Object.keys(headers).length > 0 ? { headers } : undefined;
    const response = await apiClient.get<PasteView>(`/pastes/${encodeURIComponent(id)}`, config);
    return response.data;
  },

  async deleteAnonymousPaste(id: string, deletionCapability: string): Promise<void> {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    await apiClient.post(`/pastes/${encodeURIComponent(id)}/delete-anonymous`, { deletionCapability });
  },

  async updatePasteSlug(id: string, newSlug: string, deletionCapability?: string): Promise<{ id: string; url: string }> {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    const response = await apiClient.patch<{ id: string; url: string }>(`/pastes/${encodeURIComponent(id)}/slug`, {
      newSlug,
      deletionCapability,
    });
    return response.data;
  },

  async revokeLink(id: string, deletionCapability?: string): Promise<void> {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    await apiClient.post(`/pastes/${encodeURIComponent(id)}/revoke-link`, { deletionCapability });
  },

  async rotateLink(id: string, deletionCapability?: string): Promise<RotateLinkResponse> {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    const response = await apiClient.post<RotateLinkResponse>(`/pastes/${encodeURIComponent(id)}/rotate-link`, { deletionCapability });
    return response.data;
  },

  getRawUrl(id: string, token?: string): string {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    const baseUrl = '/api/v1';
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/pastes/${encodeURIComponent(id)}/raw${query}`;
  },

  getRawFileUrl(id: string, filename: string, token?: string): string {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    if (!filename || typeof filename !== 'string' || filename.trim().length === 0) {
      throw new Error('Filename cannot be empty.');
    }
    const baseUrl = '/api/v1';
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/pastes/${encodeURIComponent(id)}/files/${encodeURIComponent(filename)}/raw${query}`;
  },

  getDownloadUrl(id: string, token?: string): string {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    const baseUrl = '/api/v1';
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/pastes/${encodeURIComponent(id)}/download${query}`;
  },

  getDownloadFileUrl(id: string, filename: string, token?: string): string {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    if (!filename || typeof filename !== 'string' || filename.trim().length === 0) {
      throw new Error('Filename cannot be empty.');
    }
    const baseUrl = '/api/v1';
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/pastes/${encodeURIComponent(id)}/files/${encodeURIComponent(filename)}/download${query}`;
  },

  getRawFileByIdUrl(id: string, fileId: number | string, token?: string): string {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    const baseUrl = '/api/v1';
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/pastes/${encodeURIComponent(id)}/files/by-id/${encodeURIComponent(String(fileId))}/raw${query}`;
  },

  getDownloadFileByIdUrl(id: string, fileId: number | string, token?: string): string {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    const baseUrl = '/api/v1';
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/pastes/${encodeURIComponent(id)}/files/by-id/${encodeURIComponent(String(fileId))}/download${query}`;
  },

  getDownloadZipUrl(id: string, token?: string): string {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    const baseUrl = '/api/v1';
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/pastes/${encodeURIComponent(id)}/download-zip${query}`;
  },

  /**
   * Builds a shareable paste URL.
   *
   * Thin wrapper over the shared canonical-URL builder, so the paste API and
   * the paste view can never disagree about what a share URL looks like.
   */
  buildShareableUrl(baseUrl: string, id: string, token?: string | null, keyFragment?: string | null): string {
    return buildCanonicalShareUrl({ baseUrl, pasteId: id, token, keyFragment });
  },

  sanitizeLogData(data: string): string {
    if (!data) return data;
    return data
      .replace(/shr_[a-zA-Z0-9_-]+/g, '[REDACTED_SHARE_TOKEN]')
      .replace(/del_[a-zA-Z0-9_-]+/g, '[REDACTED_DELETION_CAPABILITY]')
      .replace(/([?&]token=)[^&\s]+/g, '$1[REDACTED_TOKEN]')
      .replace(/(X-Paste-Password:\s*)[^\r\n]+/gi, '$1[REDACTED]')
      .replace(/(X-Comment-Delete-Token:\s*)[^\r\n]+/gi, '$1[REDACTED]')
      .replace(/(#key=)[^&\s]+/g, '$1[REDACTED_KEY]');
  },

  async downloadZip(id: string, password?: string, token?: string): Promise<Blob> {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    const headers: Record<string, string> = {};
    if (password) {
      headers['X-Paste-Password'] = password;
    }
    if (token) {
      headers['X-Share-Token'] = token;
    }
    try {
      const response = await apiClient.get(`/pastes/${encodeURIComponent(id)}/download-zip`, {
        headers,
        responseType: 'blob',
      });
      return response.data;
    } catch (err: any) {
      // Decode RFC 9457 Problem Details if server returned an error Blob
      throw await toBlobRequestError(err, 'Error downloading archive.');
    }
  },

  /**
   * Downloads a single file of a paste using the server's persisted bytes.
   *
   * Password-protected pastes must never be delivered from component state:
   * the client only ever holds the decrypted view, and the server is the
   * authority for the stored bytes. The password and the share token travel in
   * headers so they never end up in a URL, a browser history entry or a log.
   */
  async downloadFile(pasteId: string, fileId: number | string, password?: string, token?: string): Promise<Blob> {
    if (!pasteId || typeof pasteId !== 'string' || pasteId.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    if (fileId === undefined || fileId === null || `${fileId}`.trim().length === 0) {
      throw new Error('File ID cannot be empty.');
    }
    const headers: Record<string, string> = {};
    if (password) {
      headers['X-Paste-Password'] = password;
    }
    if (token) {
      headers['X-Share-Token'] = token;
    }
    try {
      const response = await apiClient.get(
        `/pastes/${encodeURIComponent(pasteId)}/files/by-id/${encodeURIComponent(String(fileId))}/download`,
        { headers, responseType: 'blob' }
      );
      return response.data;
    } catch (err: any) {
      throw await toBlobRequestError(err, 'Error downloading file.');
    }
  },

  /**
   * Fetches the raw bytes of a single file of a paste.
   *
   * Mirrors {@link downloadFile}: protected pastes are served from the server,
   * never from the cached component state.
   */
  async getRawBlob(pasteId: string, fileId: number | string, password?: string, token?: string): Promise<Blob> {
    if (!pasteId || typeof pasteId !== 'string' || pasteId.trim().length === 0) {
      throw new Error('Paste ID cannot be empty.');
    }
    if (fileId === undefined || fileId === null || `${fileId}`.trim().length === 0) {
      throw new Error('File ID cannot be empty.');
    }
    const headers: Record<string, string> = {};
    if (password) {
      headers['X-Paste-Password'] = password;
    }
    if (token) {
      headers['X-Share-Token'] = token;
    }
    try {
      const response = await apiClient.get(
        `/pastes/${encodeURIComponent(pasteId)}/files/by-id/${encodeURIComponent(String(fileId))}/raw`,
        { headers, responseType: 'blob' }
      );
      return response.data;
    } catch (err: any) {
      throw await toBlobRequestError(err, 'Error loading raw content.');
    }
  },

  async getComments(pasteId: string): Promise<import('../types/paste').CommentsListResult> {
    const response = await apiClient.get<import('../types/paste').CommentsListResult>(`/pastes/${encodeURIComponent(pasteId)}/comments`);
    return response.data;
  },

  async createComment(
    pasteId: string,
    payload: import('../types/paste').CreateCommentPayload
  ): Promise<import('../types/paste').CreateCommentResult> {
    const response = await apiClient.post<import('../types/paste').CreateCommentResult>(
      `/pastes/${encodeURIComponent(pasteId)}/comments`,
      payload
    );
    return response.data;
  },

  async deleteComment(pasteId: string, commentId: number, deletionCapability?: string): Promise<void> {
    const config = deletionCapability
      ? {
          headers: { 'X-Comment-Delete-Token': deletionCapability },
        }
      : undefined;
    await apiClient.delete(`/pastes/${encodeURIComponent(pasteId)}/comments/${encodeURIComponent(String(commentId))}`, config);
  },

  async getEmbedPaste(id: string): Promise<import('../types/paste').EmbedPasteView> {
    const response = await apiClient.get<import('../types/paste').EmbedPasteView>(`/pastes/${id}/embed`);
    return response.data;
  },

  async votePaste(id: string, voteType: 'UP' | 'DOWN', password?: string, token?: string): Promise<import('../types/paste').PasteVoteResult> {
    const headers: Record<string, string> = {};
    if (password) headers['X-Paste-Password'] = password;
    if (token) headers['X-Share-Token'] = token;
    const response = await apiClient.post<import('../types/paste').PasteVoteResult>(
      `/pastes/${id}/vote`,
      { voteType },
      Object.keys(headers).length > 0 ? { headers } : undefined
    );
    return response.data;
  },

  async retractPasteVote(id: string, password?: string, token?: string): Promise<import('../types/paste').PasteVoteResult> {
    const headers: Record<string, string> = {};
    if (password) headers['X-Paste-Password'] = password;
    if (token) headers['X-Share-Token'] = token;
    const response = await apiClient.delete<import('../types/paste').PasteVoteResult>(
      `/pastes/${id}/vote`,
      Object.keys(headers).length > 0 ? { headers } : undefined
    );
    return response.data;
  },

  async starPaste(id: string, password?: string, token?: string): Promise<import('../types/paste').PasteStarResult> {
    const headers: Record<string, string> = {};
    if (password) headers['X-Paste-Password'] = password;
    if (token) headers['X-Share-Token'] = token;
    const response = await apiClient.post<import('../types/paste').PasteStarResult>(
      `/pastes/${id}/star`,
      {},
      Object.keys(headers).length > 0 ? { headers } : undefined
    );
    return response.data;
  },

  async unstarPaste(id: string, password?: string, token?: string): Promise<import('../types/paste').PasteStarResult> {
    const headers: Record<string, string> = {};
    if (password) headers['X-Paste-Password'] = password;
    if (token) headers['X-Share-Token'] = token;
    const response = await apiClient.delete<import('../types/paste').PasteStarResult>(
      `/pastes/${id}/star`,
      Object.keys(headers).length > 0 ? { headers } : undefined
    );
    return response.data;
  },

  async addTag(pasteId: string, name: string): Promise<{ id: number; name: string }> {
    const response = await apiClient.post<{ id: number; name: string }>(
      `/pastes/${pasteId}/tags`,
      { name }
    );
    return response.data;
  },

  async getPasteTags(pasteId: string): Promise<Array<{ id: number; name: string }>> {
    const response = await apiClient.get<Array<{ id: number; name: string }>>(
      `/pastes/${pasteId}/tags`
    );
    return response.data;
  },

  async removeTag(pasteId: string, tagId: number): Promise<void> {
    await apiClient.delete(`/pastes/${pasteId}/tags/${tagId}`);
  },

  async voteComment(pasteId: string, commentId: number, voteType: 'UP' | 'DOWN', password?: string, token?: string): Promise<import('../types/paste').CommentVoteResult> {
    const headers: Record<string, string> = {};
    if (password) headers['X-Paste-Password'] = password;
    if (token) headers['X-Share-Token'] = token;
    const response = await apiClient.post<import('../types/paste').CommentVoteResult>(
      `/pastes/${pasteId}/comments/${commentId}/vote`,
      { voteType },
      Object.keys(headers).length > 0 ? { headers } : undefined
    );
    return response.data;
  },

  async retractCommentVote(pasteId: string, commentId: number, password?: string, token?: string): Promise<import('../types/paste').CommentVoteResult> {
    const headers: Record<string, string> = {};
    if (password) headers['X-Paste-Password'] = password;
    if (token) headers['X-Share-Token'] = token;
    const response = await apiClient.delete<import('../types/paste').CommentVoteResult>(
      `/pastes/${pasteId}/comments/${commentId}/vote`,
      Object.keys(headers).length > 0 ? { headers } : undefined
    );
    return response.data;
  },
};
