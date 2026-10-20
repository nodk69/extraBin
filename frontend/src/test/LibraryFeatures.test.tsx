import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AccountPage from '../features/dashboard/pages/AccountPage';
import { ViewPastePage } from '../features/pastes/pages/ViewPastePage';
import { folderApi } from '../features/pastes/api/folderApi';
import { accountApi } from '../features/dashboard/api/accountApi';
import { pasteApi } from '../features/pastes/api/pasteApi';
import { useAuth } from '../features/auth/context/AuthContext';
import { PasteView } from '../features/pastes/types/paste';

vi.mock('../features/auth/context/AuthContext');
vi.mock('../features/pastes/api/folderApi');
vi.mock('../features/dashboard/api/accountApi');

// =========================================================================
// LIB-UI-1: AccountPage library toolbar (server-side search, sort, tags)
// =========================================================================
describe('AccountPage library search, sort and tag filtering', () => {
  const mockUser = {
    id: 1,
    username: 'libraryuser',
    email: 'lib@extrabin.dev',
    role: 'USER',
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
        folderId: null,
        folderName: null,
      },
    ],
    page: 0,
    size: 15,
    totalElements: 1,
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
    (folderApi.listFolders as any).mockResolvedValue({ folders: [], unfiledCount: 0, totalCount: 1 });
    (accountApi.getMyPastes as any).mockResolvedValue(mockPastes);
    (accountApi.getMyTags as any).mockResolvedValue([
      { id: 1, name: 'java' },
      { id: 2, name: 'spring' },
    ]);
    (accountApi.getStarredPastes as any).mockResolvedValue([]);
    (accountApi.getRecentlyViewed as any).mockResolvedValue([
      {
        id: 'pv-1',
        title: 'Recently Opened Paste',
        language: 'go',
        visibility: 'PUBLIC',
        contentSizeBytes: 256,
        lineCount: 8,
        views: 2,
        createdAt: '2026-10-18T01:00:00Z',
      },
    ]);
    (accountApi.getRecentlyEdited as any).mockResolvedValue([
      {
        id: 'pe-1',
        title: 'Recently Changed Paste',
        language: 'rust',
        visibility: 'PRIVATE',
        contentSizeBytes: 512,
        lineCount: 16,
        views: 4,
        createdAt: '2026-10-18T02:00:00Z',
      },
    ]);
  });

  it('loads pastes with default sort updatedAt desc on mount', async () => {
    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(accountApi.getMyPastes).toHaveBeenCalled();
    });
    expect(accountApi.getMyPastes).toHaveBeenLastCalledWith(0, 15, undefined, undefined, undefined, undefined, 'updatedAt', 'desc');
  });

  it('sort selector triggers server-side re-query with chosen sort field', async () => {
    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Sort pastes')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Sort pastes'), { target: { value: 'title' } });

    await waitFor(() => {
      expect(accountApi.getMyPastes).toHaveBeenLastCalledWith(0, 15, undefined, undefined, undefined, undefined, 'title', 'asc');
    });
  });

  it('search box is debounced and forwards query to the server-side search endpoint', async () => {
    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search by title or content/i)).toBeInTheDocument();
    });

    const callsBefore = (accountApi.getMyPastes as any).mock.calls.length;
    fireEvent.change(screen.getByPlaceholderText(/search by title or content/i), {
      target: { value: 'deployment' },
    });

    // Debounce: no immediate extra call beyond the initial mount load
    expect((accountApi.getMyPastes as any).mock.calls.length).toBe(callsBefore);

    await waitFor(
      () => {
        expect(accountApi.getMyPastes).toHaveBeenLastCalledWith(0, 15, undefined, undefined, 'deployment', undefined, 'updatedAt', 'desc');
      },
      { timeout: 2500 }
    );
  }, 5000);

  it('tag filter dropdown lists user tags and forwards selection to the API', async () => {
    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
    });
    expect(screen.getByText('#java')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter by tag'), { target: { value: 'java' } });

    await waitFor(() => {
      expect(accountApi.getMyPastes).toHaveBeenLastCalledWith(0, 15, undefined, undefined, undefined, 'java', 'updatedAt', 'desc');
    });
  });

  it('Recently Viewed tab loads and displays viewed pastes', async () => {
    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /recently viewed/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /recently viewed/i }));

    await waitFor(() => {
      expect(accountApi.getRecentlyViewed).toHaveBeenCalled();
      expect(screen.getByText('Recently Opened Paste')).toBeInTheDocument();
    });
  });

  it('Recently Edited tab loads and displays edited pastes', async () => {
    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /recently edited/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /recently edited/i }));

    await waitFor(() => {
      expect(accountApi.getRecentlyEdited).toHaveBeenCalled();
      expect(screen.getByText('Recently Changed Paste')).toBeInTheDocument();
    });
  });
});

// =========================================================================
// LIB-UI-2: Owner tag management on ViewPastePage
// =========================================================================
describe('Owner tag management on paste view page', () => {
  const ownerPaste: PasteView = {
    id: 'reactPaste1',
    title: 'Owned Snippet',
    content: 'System.out.println("hi");',
    language: 'java',
    visibility: 'PRIVATE',
    contentSizeBytes: 50,
    lineCount: 1,
    isOwner: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 0,
    views: 10,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'owner', email: 'owner@pastebin.local', role: 'USER' },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.spyOn(pasteApi, 'getPaste').mockResolvedValue(ownerPaste);
    vi.spyOn(pasteApi, 'getPasteTags').mockResolvedValue([
      { id: 1, name: 'java' },
      { id: 2, name: 'spring' },
    ]);
  });

  it('owner sees existing tags rendered as chips', async () => {
    render(
      <BrowserRouter>
        <ViewPastePage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('#java')).toBeInTheDocument();
    });
    expect(screen.getByText('#spring')).toBeInTheDocument();
  });

  it('adding a tag calls the tag API and shows the new chip', async () => {
    const addSpy = vi
      .spyOn(pasteApi, 'addTag')
      .mockResolvedValue({ id: 3, name: 'testing' });

    render(
      <BrowserRouter>
        <ViewPastePage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('New tag name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('New tag name'), { target: { value: 'Testing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith('reactPaste1', 'testing');
      expect(screen.getByText('#testing')).toBeInTheDocument();
    });
  });

  it('removing a tag calls the delete API and removes the chip', async () => {
    const removeSpy = vi.spyOn(pasteApi, 'removeTag').mockResolvedValue(undefined);

    render(
      <BrowserRouter>
        <ViewPastePage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Remove tag java')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Remove tag java'));

    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledWith('reactPaste1', 1);
      expect(screen.queryByText('#java')).not.toBeInTheDocument();
    });
  });
});
