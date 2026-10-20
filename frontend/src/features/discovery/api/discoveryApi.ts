import { apiClient } from '../../../lib/api-client/client';
import { PagedResponse, PasteSummary } from '../../dashboard/api/accountApi';

export type DiscoveryWindow = '24h' | '7d' | '30d' | 'all';
export type DiscoverySort = 'newest' | 'oldest' | 'updated';

export interface DiscoveryFilters {
  q?: string;
  tag?: string;
  language?: string;
  window?: DiscoveryWindow;
  sort?: DiscoverySort;
}

export interface PublicTag {
  name: string;
  pasteCount: number;
}

export const discoveryApi = {
  async getDiscovery(
    page = 0,
    size = 18,
    filters: DiscoveryFilters = {},
    signal?: AbortSignal
  ): Promise<PagedResponse<PasteSummary>> {
    const params: Record<string, string | number> = { page, size };
    if (filters.q) params.q = filters.q;
    if (filters.tag) params.tag = filters.tag;
    if (filters.language && filters.language !== 'all') params.language = filters.language;
    if (filters.window && filters.window !== 'all') params.window = filters.window;
    if (filters.sort && filters.sort !== 'newest') params.sort = filters.sort;
    const response = await apiClient.get<PagedResponse<PasteSummary>>('/discovery', {
      params,
      signal,
    });
    return response.data;
  },

  async getPublicTags(signal?: AbortSignal): Promise<PublicTag[]> {
    const response = await apiClient.get<PublicTag[]>('/discovery/tags', { signal });
    return response.data;
  },

  async getMostSaved(
    page = 0,
    size = 18,
    language?: string,
    signal?: AbortSignal
  ): Promise<PagedResponse<PasteSummary>> {
    const params: Record<string, string | number> = { page, size };
    if (language && language !== 'all') params.language = language;
    const response = await apiClient.get<PagedResponse<PasteSummary>>('/discovery/most-saved', {
      params,
      signal,
    });
    return response.data;
  },
};
