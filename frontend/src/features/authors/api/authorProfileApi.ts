import { apiClient } from '../../../lib/api-client/client';
import type { PagedResponse, PasteSummary } from '../../dashboard/api/accountApi';

/**
 * Public author profile contract.
 *
 * Mirrors the backend projection exactly: only fields the platform persists and explicitly
 * exposes. There is no email, internal id, role, or private setting on this type by design.
 */
export interface PublicAuthorProfile {
  username: string;
  joinedAt: string;
  publicPasteCount: number;
  totalViews: number;
  totalSaves: number;
  recentPastes: PasteSummary[];
}

const authorBase = (username: string) => `/discovery/authors/${encodeURIComponent(username)}`;

export const authorProfileApi = {
  async getAuthorProfile(username: string, signal?: AbortSignal): Promise<PublicAuthorProfile> {
    const response = await apiClient.get<PublicAuthorProfile>(authorBase(username), { signal });
    return response.data;
  },

  async getAuthorPastes(
    username: string,
    page = 0,
    size = 18,
    signal?: AbortSignal
  ): Promise<PagedResponse<PasteSummary>> {
    const response = await apiClient.get<PagedResponse<PasteSummary>>(`${authorBase(username)}/pastes`, {
      params: { page, size },
      signal,
    });
    return response.data;
  },
};
