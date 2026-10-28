import { apiClient } from '../../../lib/api-client/client';
import { Visibility } from '../../pastes/types/paste';

export interface PasteSummary {
  id: string;
  title?: string;
  language: string;
  visibility: Visibility;
  contentSizeBytes: number;
  lineCount: number;
  createdAt: string;
  expiresAt?: string;
  version: number;
  views: number;
  folderId?: number;
  folderName?: string;
  authorUsername?: string | null;
  tags?: string[];
  starsCount?: number;
}

export interface PagedResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  isFirst: boolean;
  isLast: boolean;
}

export interface EditPasteFileItemPayload {
  id?: number;
  filename: string;
  content: string;
  language?: string;
}

export interface EditPastePayload {
  title?: string;
  content?: string;
  language?: string;
  visibility: Visibility;
  version: number;
  files?: EditPasteFileItemPayload[];
}

export interface PasteRevisionFile {
  id?: number;
  filename: string;
  content: string;
  language: string;
  sizeBytes?: number;
  lineCount?: number;
  sortOrder?: number;
  isPrimary?: boolean;
}

export interface PasteRevision {
  id: number;
  version: number;
  title?: string;
  content: string;
  language: string;
  createdAt: string;
  files?: PasteRevisionFile[];
}

export interface TagItem {
  id: number;
  name: string;
}

export interface AccountStats {
  totalPastes: number;
  publicCount: number;
  unlistedCount: number;
  privateCount: number;
  totalLines: number;
  totalViews: number;
}

export const accountApi = {
  async getMyPastes(
    page = 0,
    size = 20,
    folderId?: number,
    unfiled?: boolean,
    search?: string,
    tag?: string,
    sort?: string,
    direction?: string,
    visibility?: string
  ): Promise<PagedResponse<PasteSummary>> {
    const response = await apiClient.get<PagedResponse<PasteSummary>>('/account/pastes', {
      params: { page, size, folderId, unfiled, search, tag, sort, direction, visibility },
    });
    return response.data;
  },

  async getStats(): Promise<AccountStats> {
    const response = await apiClient.get<AccountStats>('/account/stats');
    return response.data;
  },

  async editPaste(id: string, payload: EditPastePayload) {
    const response = await apiClient.put(`/account/pastes/${id}`, payload);
    return response.data;
  },

  async deleteOwnedPaste(id: string): Promise<void> {
    await apiClient.delete(`/account/pastes/${id}`);
  },

  async getRevisions(id: string): Promise<PasteRevision[]> {
    const response = await apiClient.get<PasteRevision[]>(`/account/pastes/${id}/revisions`);
    return response.data;
  },

  async restoreRevision(id: string, version: number) {
    const response = await apiClient.post(`/account/pastes/${id}/revisions/${version}/restore`);
    return response.data;
  },

  async getStarredPastes(): Promise<PasteSummary[]> {
    const response = await apiClient.get<PasteSummary[]>('/pastes/starred');
    return response.data;
  },

  async getMyTags(): Promise<TagItem[]> {
    const response = await apiClient.get<TagItem[]>('/account/tags');
    return response.data;
  },

  async getRecentlyViewed(): Promise<PasteSummary[]> {
    const response = await apiClient.get<PasteSummary[]>('/account/recently-viewed');
    return response.data;
  },

  async getRecentlyEdited(): Promise<PasteSummary[]> {
    const response = await apiClient.get<PasteSummary[]>('/account/recently-edited');
    return response.data;
  },
};
