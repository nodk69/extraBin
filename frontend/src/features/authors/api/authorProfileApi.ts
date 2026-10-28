import { apiClient } from '../../../lib/api-client/client';
import type { PagedResponse, PasteSummary } from '../../dashboard/api/accountApi';
import { DISCOVERY_PAGE_SIZE } from '../../discovery/api/discoveryApi';

export const FOLLOWING_CHANGED_EVENT = 'extrabin:following-changed';
export interface FollowingFeedCursorResponse {
  items: PasteSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Public author profile contract.
 *
 * Mirrors the backend projection exactly: only fields the platform persists and explicitly
 * exposes. There is no email, internal id, role, or private setting on this type by design.
 */
export interface PublicAuthorProfile {
  username: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  xUrl?: string | null;
  joinedAt: string;
  publicPasteCount: number;
  totalViews: number;
  totalSaves: number;
  recentPastes: PasteSummary[];
  popularPastes?: PasteSummary[];
  topLanguages?: string[];
  languagesCount?: number;
  followerCount?: number;
  followingCount?: number;
  followedByViewer?: boolean;
}

export interface DeveloperRelationship {
  username: string;
  joinedAt: string;
  followerCount: number;
  followingCount: number;
  followedByViewer: boolean;
}

const authorBase = (username: string) => `/discovery/authors/${encodeURIComponent(username)}`;

export const authorProfileApi = {
  async follow(username: string): Promise<void> {
    await apiClient.post(`${authorBase(username)}/follow`);
    window.dispatchEvent(new Event(FOLLOWING_CHANGED_EVENT));
  },

  async unfollow(username: string): Promise<void> {
    await apiClient.delete(`${authorBase(username)}/follow`);
    window.dispatchEvent(new Event(FOLLOWING_CHANGED_EVENT));
  },

  async getRelationshipList(username: string, kind: 'followers' | 'following', page = 0, size = 20, signal?: AbortSignal): Promise<PagedResponse<DeveloperRelationship>> {
    const response = await apiClient.get<PagedResponse<DeveloperRelationship>>(`${authorBase(username)}/${kind}`, { params: { page, size }, signal });
    return response.data;
  },

  async getFollowingFeed(page = 0, size = DISCOVERY_PAGE_SIZE, signal?: AbortSignal): Promise<PagedResponse<PasteSummary>> {
    const response = await apiClient.get<PagedResponse<PasteSummary>>('/discovery/authors/following/feed', { params: { page, size }, signal });
    return response.data;
  },

  async getFollowingFeedCursor(cursor?: string, size = DISCOVERY_PAGE_SIZE, signal?: AbortSignal): Promise<FollowingFeedCursorResponse> {
    const response = await apiClient.get<FollowingFeedCursorResponse>('/discovery/authors/following/feed/cursor', {
      params: { ...(cursor ? { cursor } : {}), size }, signal,
    });
    return response.data;
  },

  async getDevelopers(page = 0, size = 20, signal?: AbortSignal): Promise<PagedResponse<DeveloperRelationship>> {
    const response = await apiClient.get<PagedResponse<DeveloperRelationship>>('/discovery/authors/developers', { params: { page, size }, signal });
    return response.data;
  },

  async getAuthorProfile(username: string, signal?: AbortSignal): Promise<PublicAuthorProfile> {
    const response = await apiClient.get<PublicAuthorProfile>(authorBase(username), { signal });
    return response.data;
  },

  async getAuthorPastes(
    username: string,
    page = 0,
    size = 18,
    paramsOrSignal?: { q?: string; language?: string; sort?: string } | AbortSignal,
    maybeSignal?: AbortSignal
  ): Promise<PagedResponse<PasteSummary>> {
    let params: { q?: string; language?: string; sort?: string } | undefined;
    let signal: AbortSignal | undefined;

    if (paramsOrSignal instanceof AbortSignal) {
      signal = paramsOrSignal;
    } else {
      params = paramsOrSignal;
      signal = maybeSignal;
    }

    const queryParams: Record<string, string | number> = { page, size };
    if (params?.q) queryParams.q = params.q;
    if (params?.language && params.language !== 'all') queryParams.language = params.language;
    if (params?.sort && params.sort !== 'newest') queryParams.sort = params.sort;

    const response = await apiClient.get<PagedResponse<PasteSummary>>(`${authorBase(username)}/pastes`, {
      params: queryParams,
      signal,
    });
    return response.data;
  },
};
