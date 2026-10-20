import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { DiscoveryPage } from '../features/discovery/pages/DiscoveryPage';
import { discoveryApi } from '../features/discovery/api/discoveryApi';
import { accountApi } from '../features/dashboard/api/accountApi';
import { useAuth } from '../features/auth/context/AuthContext';
import type { PagedResponse, PasteSummary } from '../features/dashboard/api/accountApi';

vi.mock('../features/discovery/api/discoveryApi', () => ({
  discoveryApi: {
    getDiscovery: vi.fn(),
    getPublicTags: vi.fn(),
    getMostSaved: vi.fn(),
  },
}));

vi.mock('../features/dashboard/api/accountApi', () => ({
  accountApi: {
    getStarredPastes: vi.fn(),
  },
}));

vi.mock('../features/pastes/api/pasteApi', () => ({
  pasteApi: {
    starPaste: vi.fn(),
    unstarPaste: vi.fn(),
  },
}));

vi.mock('../features/auth/context/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Updated for Discovery Increment 1: search is now server-side (the previous client-side
// page-filter test was replaced by a server-side search test — documented plan deviation),
// and the API mock covers the new getPublicTags/getMostSaved endpoints plus useAuth.
describe('DiscoveryPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    vi.mocked(discoveryApi.getPublicTags).mockResolvedValue([]);
    vi.mocked(accountApi.getStarredPastes).mockResolvedValue([]);
    vi.mocked(discoveryApi.getMostSaved).mockResolvedValue({
      items: [],
      page: 0,
      size: 18,
      totalElements: 0,
      totalPages: 0,
      isFirst: true,
      isLast: true,
    });
  });

  const mockPagedData: PagedResponse<PasteSummary> = {
    items: [
      {
        id: '12345678-abcd',
        title: 'Spring Security Config',
        language: 'java',
        visibility: 'PUBLIC' as any,
        contentSizeBytes: 2048,
        lineCount: 45,
        createdAt: '2026-10-15T12:00:00Z',
        version: 1,
        views: 12,
      },
      {
        id: '87654321-dcba',
        title: 'React Custom Hook',
        language: 'typescript',
        visibility: 'PUBLIC' as any,
        contentSizeBytes: 1024,
        lineCount: 20,
        createdAt: '2026-10-16T15:30:00Z',
        version: 1,
        views: 4,
      },
    ],
    page: 0,
    size: 18,
    totalElements: 2,
    totalPages: 1,
    isFirst: true,
    isLast: true,
  };

  it('renders loading state and then populates paste cards', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(mockPagedData);

    render(
      <BrowserRouter>
        <DiscoveryPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Fetching snippets from public registry/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Spring Security Config')).toBeInTheDocument();
      expect(screen.getByText('React Custom Hook')).toBeInTheDocument();
    });
  });

  it('handles null/undefined fields gracefully without crashing', async () => {
    const dataWithNulls: PagedResponse<PasteSummary> = {
      items: [
        {
          id: null as any,
          title: null as any,
          language: null as any,
          visibility: 'PUBLIC' as any,
          contentSizeBytes: null as any,
          lineCount: null as any,
          createdAt: null as any,
          version: 1,
          views: null as any,
        },
      ],
      page: 0,
      size: 18,
      totalElements: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
    };

    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(dataWithNulls);

    render(
      <BrowserRouter>
        <DiscoveryPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Untitled Snippet')).toBeInTheDocument();
      expect(screen.getByText('#unknown')).toBeInTheDocument();
      expect(screen.getByText('Recently')).toBeInTheDocument();
    });
  });

  it('shows error state with retry button when API fails', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockRejectedValueOnce(new Error('Network error'));

    render(
      <BrowserRouter>
        <DiscoveryPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to connect to registry/i)).toBeInTheDocument();
      expect(screen.getByText(/Retry Connection/i)).toBeInTheDocument();
    });

    // Test retry
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(mockPagedData);
    fireEvent.click(screen.getByText(/Retry Connection/i));

    await waitFor(() => {
      expect(screen.getByText('Spring Security Config')).toBeInTheDocument();
    });
  });

  it('sends search queries server-side via the Search button', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(mockPagedData);

    render(
      <BrowserRouter>
        <DiscoveryPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Spring Security Config')).toBeInTheDocument();
      expect(screen.getByText('React Custom Hook')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('Search public snippets');
    fireEvent.change(searchInput, { target: { value: 'react' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      const lastCall = vi.mocked(discoveryApi.getDiscovery).mock.calls[vi.mocked(discoveryApi.getDiscovery).mock.calls.length - 1];
      expect(lastCall[0]).toBe(0);
      expect(lastCall[2]).toEqual(expect.objectContaining({ q: 'react' }));
    });
  });

  it('prevents race conditions when switching language tabs rapidly', async () => {
    // Request 1: Slow JS response
    let resolveSlow: (val: any) => void;
    const slowPromise = new Promise((resolve) => {
      resolveSlow = resolve;
    });

    // Request 2: Fast Python response
    const fastPythonData: PagedResponse<PasteSummary> = {
      items: [
        {
          id: 'py-1',
          title: 'Fast Python Snippet',
          language: 'python',
          visibility: 'PUBLIC' as any,
          contentSizeBytes: 500,
          lineCount: 10,
          createdAt: '2026-10-17T00:00:00Z',
          version: 1,
          views: 1,
        },
      ],
      page: 0,
      size: 18,
      totalElements: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
    };

    vi.mocked(discoveryApi.getDiscovery)
      .mockReturnValueOnce(slowPromise as any) // Initial load / JavaScript
      .mockResolvedValueOnce(fastPythonData); // Python click

    render(
      <BrowserRouter>
        <DiscoveryPage />
      </BrowserRouter>
    );

    // Redesign: language is now a compact native select rather than a chip row.
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'python' } });

    // Wait for Python to render
    await waitFor(() => {
      expect(screen.getByText('Fast Python Snippet')).toBeInTheDocument();
    });

    // Now resolve the slow request with JS data
    const slowJsData: PagedResponse<PasteSummary> = {
      items: [
        {
          id: 'js-1',
          title: 'Stale JS Snippet',
          language: 'javascript',
          visibility: 'PUBLIC' as any,
          contentSizeBytes: 300,
          lineCount: 5,
          createdAt: '2026-10-17T00:00:00Z',
          version: 1,
          views: 1,
        },
      ],
      page: 0,
      size: 18,
      totalElements: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
    };
    resolveSlow!(slowJsData);

    // Stale JS snippet must NOT overwrite the active Python results!
    expect(screen.queryByText('Stale JS Snippet')).not.toBeInTheDocument();
    expect(screen.getByText('Fast Python Snippet')).toBeInTheDocument();
  });
});
