import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AccountPage from '../features/dashboard/pages/AccountPage';
import { folderApi } from '../features/pastes/api/folderApi';
import { accountApi } from '../features/dashboard/api/accountApi';
import { useAuth } from '../features/auth/context/AuthContext';

// Mock dependencies
vi.mock('../features/auth/context/AuthContext');
vi.mock('../features/pastes/api/folderApi');
vi.mock('../features/dashboard/api/accountApi');

describe('Folders and Organization UI', () => {
  const mockUser = {
    id: 1,
    username: 'testdeveloper',
    email: 'test@extrabin.dev',
    role: 'USER',
  };

  const mockFolderOverview = {
    folders: [
      { id: 10, name: 'api-specs', pasteCount: 2, createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z' },
      { id: 20, name: 'docker-configs', pasteCount: 1, createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z' },
    ],
    unfiledCount: 3,
    totalCount: 6,
  };

  const mockPastes = {
    items: [
      {
        id: 'paste-1',
        title: 'User API Spec',
        language: 'yaml',
        visibility: 'PUBLIC',
        contentSizeBytes: 1024,
        lineCount: 45,
        views: 12,
        createdAt: '2026-10-17T01:00:00Z',
        folderId: 10,
        folderName: 'api-specs',
      },
      {
        id: 'paste-2',
        title: 'Unfiled Notes',
        language: 'markdown',
        visibility: 'PRIVATE',
        contentSizeBytes: 512,
        lineCount: 10,
        views: 3,
        createdAt: '2026-10-17T02:00:00Z',
        folderId: null,
        folderName: null,
      },
    ],
    page: 0,
    size: 20,
    totalElements: 2,
    totalPages: 1,
    isFirst: true,
    isLast: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
    });
    (folderApi.listFolders as any).mockResolvedValue(mockFolderOverview);
    (accountApi.getMyPastes as any).mockResolvedValue(mockPastes);
    (accountApi.getMyTags as any).mockResolvedValue([]);
  });

  it('renders folder tabs with correct counts and paste folder badges', async () => {
    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Folders:')).toBeInTheDocument();
      expect(screen.getByText('All Pastes (6)')).toBeInTheDocument();
      expect(screen.getByText('Unfiled (3)')).toBeInTheDocument();
      expect(screen.getAllByText('api-specs').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('docker-configs')).toBeInTheDocument();
    });

    // Check folder badge in table
    expect(screen.getByText('User API Spec')).toBeInTheDocument();
    const folderBadges = screen.getAllByText('api-specs');
    expect(folderBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('opens create folder modal and submits new folder', async () => {
    (folderApi.createFolder as any).mockResolvedValue({
      id: 30,
      name: 'nginx-configs',
      pasteCount: 0,
      createdAt: '2026-10-17T03:00:00Z',
      updatedAt: '2026-10-17T03:00:00Z',
    });

    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('New Folder')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Folder'));

    expect(screen.getByText('Create New Folder')).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/e\.g\. backend-snippets/i);
    fireEvent.change(input, { target: { value: 'nginx-configs' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Folder' }));

    await waitFor(() => {
      expect(folderApi.createFolder).toHaveBeenCalledWith('nginx-configs');
    });
  });

  it('opens delete folder modal with orphan-handling warning', async () => {
    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Delete folder api-specs')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Delete folder api-specs'));

    expect(screen.getByText(/Are you sure you want to delete folder/i)).toBeInTheDocument();
    expect(screen.getByText(/safely become/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Folder' })).toBeInTheDocument();
  });

  it('opens move paste modal and allows moving to unfiled or another folder', async () => {
    (folderApi.movePaste as any).mockResolvedValue({});

    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Move paste User API Spec to folder')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Move paste User API Spec to folder'));

    expect(screen.getByText('Move Paste')).toBeInTheDocument();
    expect(screen.getByText('Unfiled (No folder)')).toBeInTheDocument();

    // Target the button inside the modal
    const dockerButtons = screen.getAllByRole('button', { name: /docker-configs/i });
    fireEvent.click(dockerButtons[dockerButtons.length - 1]);

    await waitFor(() => {
      expect(folderApi.movePaste).toHaveBeenCalledWith('paste-1', 20);
    });
  });
});
