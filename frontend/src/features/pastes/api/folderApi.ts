import { apiClient, ApiError } from '../../../lib/api-client/client';
import { PasteSummary } from '../../dashboard/api/accountApi';

export interface FolderItem {
  id: number;
  name: string;
  pasteCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderOverview {
  folders: FolderItem[];
  unfiledCount: number;
  totalCount: number;
}

function validateFolderName(name: string): void {
  if (name === null || name === undefined || name.trim().length === 0) {
    throw new ApiError({
      title: 'Bad Request',
      status: 400,
      detail: 'Folder name cannot be blank.',
    });
  }
  if (name.length > 100) {
    throw new ApiError({
      title: 'Bad Request',
      status: 400,
      detail: 'Folder name cannot exceed 100 characters.',
    });
  }
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 32 || code === 127) {
      throw new ApiError({
        title: 'Bad Request',
        status: 400,
        detail: 'Folder name contains invalid control characters.',
      });
    }
  }
}

export const folderApi = {
  async listFolders(): Promise<FolderOverview> {
    const response = await apiClient.get<FolderOverview>('/folders');
    return response.data;
  },

  async createFolder(name: string): Promise<FolderItem> {
    validateFolderName(name);
    const response = await apiClient.post<FolderItem>('/folders', { name });
    return response.data;
  },

  async renameFolder(id: number, name: string): Promise<FolderItem> {
    validateFolderName(name);
    const response = await apiClient.put<FolderItem>(`/folders/${id}`, { name });
    return response.data;
  },

  async deleteFolder(id: number): Promise<void> {
    await apiClient.delete(`/folders/${id}`);
  },

  async movePaste(pastePublicId: string, folderId: number | null): Promise<PasteSummary> {
    const response = await apiClient.put<PasteSummary>(`/folders/pastes/${pastePublicId}/move`, { folderId });
    return response.data;
  },
};
