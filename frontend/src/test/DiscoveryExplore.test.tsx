import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { DiscoveryPage } from '../features/discovery/pages/DiscoveryPage';
import { discoveryApi } from '../features/discovery/api/discoveryApi';
import { pasteApi } from '../features/pastes/api/pasteApi';
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

/**
 * DFP-01..DFP-11: Discovery Increment 1 frontend contract (server-side search, tag chips,
 * window/sort, most-saved tab, author attribution, star toggle, pagination reset, honest empty states).
 */
describe('DiscoveryPage Increment 1 (server-side search, tags, most-saved, attribution)', () => {
  const emptyPage: PagedResponse<PasteSummary> = {
    items: [],
    page: 0,
    size: 18,
    totalElements: 0,
    totalPages: 0,
    isFirst: true,
    isLast: true,
  };

  const makePage = (items: any[], totalElements = items.length): PagedResponse<PasteSummary> => ({
    items: items as PasteSummary[],
    page: 0,
    size: 18,
    totalElements,
    totalPages: Math.max(1, Math.ceil(totalElements / 18)),
    isFirst: true,
    isLast: totalElements <= 18,
  });

  const sampleItems = [
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
      authorUsername: 'alice',
      tags: ['spring', 'security'],
      starsCount: 3,
    },
    {
      id: '87654321-dcba',
      title: 'Orphan Snippet',
      language: 'python',
      visibility: 'PUBLIC' as any,
      contentSizeBytes: 512,
      lineCount: 8,
      createdAt: '2026-10-16T15:30:00Z',
      version: 1,
      views: 4,
      authorUsername: null,
      tags: [],
      starsCount: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/');
    (useAuth as any).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(emptyPage);
    vi.mocked(discoveryApi.getPublicTags).mockResolvedValue([]);
    vi.mocked(discoveryApi.getMostSaved).mockResolvedValue(emptyPage);
    vi.mocked(accountApi.getStarredPastes).mockResolvedValue([]);
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  const renderPage = () =>
    render(
      <BrowserRouter>
        <DiscoveryPage />
      </BrowserRouter>
    );

  it('DFP-01 serverSideSearch_sendsQueryToBackend', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage(sampleItems));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Spring Security Config')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Search public snippets');
    fireEvent.change(input, { target: { value: 'spring' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      const lastCall = vi.mocked(discoveryApi.getDiscovery).mock.calls[vi.mocked(discoveryApi.getDiscovery).mock.calls.length - 1];
      expect(lastCall[0]).toBe(0);
      expect(lastCall[2]).toEqual(expect.objectContaining({ q: 'spring' }));
    });
  });

  it('DFP-02 tagDropdown_loadedFromPublicTags_setTagFilter', async () => {
    vi.mocked(discoveryApi.getPublicTags).mockResolvedValue([
      { name: 'spring', pasteCount: 2 },
      { name: 'sql', pasteCount: 1 },
    ]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Popular tags')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Popular tags'), { target: { value: 'spring' } });

    await waitFor(() => {
      const lastCall = vi.mocked(discoveryApi.getDiscovery).mock.calls[vi.mocked(discoveryApi.getDiscovery).mock.calls.length - 1];
      expect(lastCall[2]).toEqual(expect.objectContaining({ tag: 'spring' }));
      expect(lastCall[0]).toBe(0);
    });
  });

  it('DFP-03 windowAndSort_wiredToLatestTab', async () => {
    renderPage();

    await waitFor(() => {
      expect(vi.mocked(discoveryApi.getDiscovery).mock.calls.length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText('Time window'), { target: { value: '7d' } });
    await waitFor(() => {
      const lastCall = vi.mocked(discoveryApi.getDiscovery).mock.calls[vi.mocked(discoveryApi.getDiscovery).mock.calls.length - 1];
      expect(lastCall[2]).toEqual(expect.objectContaining({ window: '7d' }));
      expect(lastCall[0]).toBe(0);
    });

    fireEvent.change(screen.getByLabelText('Sort snippets'), { target: { value: 'oldest' } });
    await waitFor(() => {
      const lastCall = vi.mocked(discoveryApi.getDiscovery).mock.calls[vi.mocked(discoveryApi.getDiscovery).mock.calls.length - 1];
      expect(lastCall[2]).toEqual(expect.objectContaining({ sort: 'oldest' }));
      expect(lastCall[0]).toBe(0);
    });
  });

  it('DFP-04 mostSavedTab_callsMostSavedEndpoint', async () => {
    vi.mocked(discoveryApi.getMostSaved).mockResolvedValue(makePage(sampleItems));
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Most saved' })).toBeInTheDocument();
    });

    const discoveryCallsBefore = vi.mocked(discoveryApi.getDiscovery).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Most saved' }));

    await waitFor(() => {
      expect(vi.mocked(discoveryApi.getMostSaved).mock.calls.length).toBeGreaterThan(0);
    });
    expect(vi.mocked(discoveryApi.getDiscovery).mock.calls.length).toBe(discoveryCallsBefore);
    expect(await screen.findByText('Spring Security Config')).toBeInTheDocument();
  });

  it('DFP-05 authorAttribution_usernameAndNeutralFallback', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage(sampleItems));
    renderPage();

    expect(await screen.findByText('by @alice')).toBeInTheDocument();
    expect(screen.getByText('Author unavailable')).toBeInTheDocument();
  });

  it('DFP-06 cardTagChips_setTagFilter', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage(sampleItems));
    renderPage();

    const chip = await screen.findByRole('button', { name: '#security' });
    fireEvent.click(chip);

    await waitFor(() => {
      const lastCall = vi.mocked(discoveryApi.getDiscovery).mock.calls[vi.mocked(discoveryApi.getDiscovery).mock.calls.length - 1];
      expect(lastCall[2]).toEqual(expect.objectContaining({ tag: 'security' }));
    });
  });

  it('DFP-07 starToggle_authedCallsApi_anonPromptsLogin', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage(sampleItems));
    // Fixture note: part 1 requires an authenticated viewer (the beforeEach default is anonymous);
    // the anonymous behavior is asserted in part 2 below.
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'alice' },
      isAuthenticated: true,
      isLoading: false,
    });

    const { unmount } = renderPage();
    const starBtn = await screen.findByRole('button', { name: 'Save snippet Spring Security Config' });
    fireEvent.click(starBtn);
    expect(pasteApi.starPaste).toHaveBeenCalledWith('12345678-abcd');
    unmount();

    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage(sampleItems));

    renderPage();
    await screen.findByText('Spring Security Config');
    expect(screen.getByText('Log in to save')).toBeInTheDocument();
    expect(pasteApi.starPaste).not.toHaveBeenCalled();
  });

  it('DFP-08 filterChange_resetsPaginationToFirstPage', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue({
      items: sampleItems as any,
      page: 0,
      size: 18,
      totalElements: 40,
      totalPages: 3,
      isFirst: true,
      isLast: false,
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Spring Security Config')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(vi.mocked(discoveryApi.getDiscovery).mock.calls[vi.mocked(discoveryApi.getDiscovery).mock.calls.length - 1][0]).toBe(1);
    });

    fireEvent.change(screen.getByLabelText('Time window'), { target: { value: '30d' } });
    await waitFor(() => {
      const lastCall = vi.mocked(discoveryApi.getDiscovery).mock.calls[vi.mocked(discoveryApi.getDiscovery).mock.calls.length - 1];
      expect(lastCall[0]).toBe(0);
      expect(lastCall[2]).toEqual(expect.objectContaining({ window: '30d' }));
    });
  });

  it('DFP-09 mostSavedEmpty_showsHonestEmptyState', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Most saved' }));

    expect(await screen.findByText(/No saved snippets yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/starred pastes will appear here once the community saves snippets/i)).toBeNull();
  });

  it('DFP-10 mostSavedError_showsRetry', async () => {
    vi.mocked(discoveryApi.getMostSaved).mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Most saved' }));

    expect(await screen.findByText(/Could not load most-saved snippets/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /retry/i });

    vi.mocked(discoveryApi.getMostSaved).mockResolvedValueOnce(makePage(sampleItems));
    fireEvent.click(retry);
    expect(await screen.findByText('Spring Security Config')).toBeInTheDocument();
  });

  it('DFP-11 clearFilters_resetsSearchTagWindow', async () => {
    vi.mocked(discoveryApi.getPublicTags).mockResolvedValue([{ name: 'spring', pasteCount: 2 }]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Popular tags')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Search public snippets'), { target: { value: 'kafka' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByLabelText('Popular tags'), { target: { value: 'spring' } });
    // Redesign: the empty state now also offers a clear action, so scope the query to the filter panel.
    const panel = screen.getByRole('region', { name: /search and filter/i });
    fireEvent.click(within(panel).getByRole('button', { name: /clear filters/i }));

    await waitFor(() => {
      const lastCall = vi.mocked(discoveryApi.getDiscovery).mock.calls[vi.mocked(discoveryApi.getDiscovery).mock.calls.length - 1];
      expect(lastCall[2]?.q).toBeFalsy();
      expect(lastCall[2]?.tag).toBeFalsy();
      expect((screen.getByLabelText('Search public snippets') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Popular tags') as HTMLSelectElement).value).toBe('all');
    });
  });
});
