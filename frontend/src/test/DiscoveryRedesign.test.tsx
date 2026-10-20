import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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

vi.mock('../features/pastes/api/pasteApi', () => ({
  pasteApi: {
    starPaste: vi.fn(),
    unstarPaste: vi.fn(),
  },
}));

vi.mock('../features/dashboard/api/accountApi', () => ({
  accountApi: {
    getStarredPastes: vi.fn(),
  },
}));

vi.mock('../features/auth/context/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/**
 * Discovery Page UI/UX redesign — Phase 2 red-phase contract.
 * Every assertion below targets the approved redesign DOM/behaviour; against the
 * pre-redesign component the failing assertions are the intended red signal.
 */
describe('DiscoveryPage redesign contract', () => {
  const makePaste = (overrides: Partial<PasteSummary> & Record<string, unknown> = {}): PasteSummary =>
    ({
      id: 'id-1',
      title: 'Sample Paste',
      language: 'java',
      visibility: 'PUBLIC' as any,
      contentSizeBytes: 2048,
      lineCount: 45,
      createdAt: '2026-10-15T12:00:00Z',
      version: 1,
      views: 12,
      authorUsername: 'alice',
      tags: ['spring'],
      starsCount: 3,
      ...overrides,
    } as PasteSummary);

  const makePage = (items: PasteSummary[], overrides: Partial<PagedResponse<PasteSummary>> = {}): PagedResponse<PasteSummary> => ({
    items,
    page: 0,
    size: 18,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    isFirst: true,
    isLast: true,
    ...overrides,
  });

  const lastDiscoveryCall = () => {
    const calls = vi.mocked(discoveryApi.getDiscovery).mock.calls;
    return calls[calls.length - 1];
  };

  const asGuest = () => {
    (useAuth as any).mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });
  };

  const asUser = () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, username: 'alice' },
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const renderPage = () =>
    render(
      <BrowserRouter>
        <DiscoveryPage />
      </BrowserRouter>
    );

  const submitSearch = (value: string) => {
    const input = screen.getByLabelText('Search public snippets');
    fireEvent.change(input, { target: { value } });
    const form = input.closest('form');
    if (!form) throw new Error('Search input is not wrapped in a form');
    fireEvent.submit(form);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    asGuest();
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([]));
    vi.mocked(discoveryApi.getPublicTags).mockResolvedValue([]);
    vi.mocked(discoveryApi.getMostSaved).mockResolvedValue(makePage([]));
    vi.mocked(accountApi.getStarredPastes).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RED-D01 headerAndTabs_renderSemantically', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([makePaste()]));
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Explore public pastes' })).toBeInTheDocument();
    expect(screen.getByText(/COMMUNITY \/ DISCOVER/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create paste' })).toHaveAttribute('href', '/');

    const tabNav = screen.getByRole('navigation', { name: 'Discovery views' });
    const explore = within(tabNav).getByRole('button', { name: 'Explore' });
    const mostSaved = within(tabNav).getByRole('button', { name: 'Most saved' });
    expect(explore).toHaveAttribute('aria-pressed', 'true');
    expect(mostSaved).toHaveAttribute('aria-pressed', 'false');
  });

  it('RED-D02 searchEnter_submitsCommittedQueryFromForm', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([makePaste()]));
    renderPage();
    await screen.findByText('Sample Paste');

    submitSearch('spring');

    await waitFor(() => {
      const last = lastDiscoveryCall();
      expect(last[0]).toBe(0);
      expect(last[2]).toEqual(expect.objectContaining({ q: 'spring' }));
    });
  });

  it('RED-D03 languageFilter_resetsPageToZero', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(
      makePage([makePaste()], { totalElements: 40, totalPages: 3, isLast: false })
    );
    renderPage();
    await screen.findByText('Sample Paste');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(lastDiscoveryCall()[0]).toBe(1));

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'python' } });
    await waitFor(() => {
      const last = lastDiscoveryCall();
      expect(last[0]).toBe(0);
      expect(last[2]).toEqual(expect.objectContaining({ language: 'python' }));
    });
  });

  it('RED-D04 clearFilters_restoresLanguageQueryAndDefaults', async () => {
    vi.mocked(discoveryApi.getPublicTags).mockResolvedValue([{ name: 'spring', pasteCount: 2 }]);
    renderPage();
    await screen.findByRole('button', { name: /#spring/ });

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'javascript' } });
    submitSearch('kafka');
    await screen.findByRole('button', { name: /#spring/ });

    const panel = screen.getByRole('region', { name: /search and filter/i });
    fireEvent.click(within(panel).getByRole('button', { name: /clear filters/i }));

    await waitFor(() => {
      const last = lastDiscoveryCall();
      expect(last[2]?.q).toBeFalsy();
      expect(last[2]?.language).toBeFalsy();
      expect((screen.getByLabelText('Search public snippets') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Language') as HTMLSelectElement).value).toBe('all');
    });
  });

  it('RED-D05 popularTagChip_togglesSelectionOnAndOff', async () => {
    vi.mocked(discoveryApi.getPublicTags).mockResolvedValue([{ name: 'spring', pasteCount: 2 }]);
    renderPage();

    const chip = await screen.findByRole('button', { name: /#spring/ });
    fireEvent.click(chip);
    await waitFor(() => expect(lastDiscoveryCall()[2]).toEqual(expect.objectContaining({ tag: 'spring' })));

    const selected = screen.getByRole('button', { name: /#spring/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(selected);
    await waitFor(() => expect(lastDiscoveryCall()[2]?.tag).toBeFalsy());
  });

  it('RED-D06 selectedTag_exposesRemovableControl', async () => {
    vi.mocked(discoveryApi.getPublicTags).mockResolvedValue([{ name: 'spring', pasteCount: 2 }]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /#spring/ }));
    const remove = await screen.findByRole('button', { name: /remove tag filter spring/i });
    fireEvent.click(remove);

    await waitFor(() => expect(lastDiscoveryCall()[2]?.tag).toBeFalsy());
  });

  it('RED-D07 mostSaved_onlyExposesLanguageFilter', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Most saved' }));
    await screen.findByRole('heading', { name: 'Most saved' });

    expect(screen.getByLabelText('Language')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search public snippets')).toBeNull();
    expect(screen.queryByLabelText('Time window')).toBeNull();
    expect(screen.queryByLabelText('Sort snippets')).toBeNull();
  });

  it('RED-D08 mostSavedLanguage_resetsItsOwnPageCursor', async () => {
    vi.mocked(discoveryApi.getMostSaved).mockResolvedValue(
      makePage([makePaste()], { totalElements: 40, totalPages: 3, isLast: false })
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Most saved' }));
    await screen.findByText('Sample Paste');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      const calls = vi.mocked(discoveryApi.getMostSaved).mock.calls;
      expect(calls[calls.length - 1][0]).toBe(1);
    });

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'go' } });
    await waitFor(() => {
      const calls = vi.mocked(discoveryApi.getMostSaved).mock.calls;
      const last = calls[calls.length - 1];
      expect(last[0]).toBe(0);
      expect(last[2]).toBe('go');
    });
  });

  it('RED-D09 resultsHeader_showsRealApiCountAndTitle', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(
      makePage([makePaste(), makePaste({ id: 'id-2', title: 'Second Paste' })], { totalElements: 2 })
    );
    renderPage();

    expect(await screen.findByRole('heading', { level: 2, name: 'Latest public pastes' })).toBeInTheDocument();
    expect(await screen.findByText('2 public pastes')).toBeInTheDocument();
  });

  it('RED-D10 pagination_respectsApiBoundaries', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(
      makePage([makePaste()], { page: 0, totalElements: 40, totalPages: 3, isFirst: true, isLast: false })
    );
    const first = renderPage();
    await screen.findByText('Sample Paste');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    first.unmount();

    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(
      makePage([makePaste()], { page: 2, totalElements: 40, totalPages: 3, isFirst: false, isLast: true })
    );
    renderPage();
    await screen.findByText('Sample Paste');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('RED-D11 abortedRequest_showsNoFalseErrorPanel', async () => {
    const abortError = Object.assign(new Error('canceled'), { name: 'CanceledError' });
    vi.mocked(discoveryApi.getDiscovery).mockRejectedValue(abortError);
    renderPage();

    await waitFor(() => expect(vi.mocked(discoveryApi.getDiscovery)).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: /failed to connect to registry/i })).toBeNull();
  });

  it('RED-D12 refreshError_keepsPreviousResultsWithRetry', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(makePage([makePaste()]));
    renderPage();
    await screen.findByText('Sample Paste');

    vi.mocked(discoveryApi.getDiscovery).mockRejectedValueOnce(new Error('offline'));
    fireEvent.change(screen.getByLabelText('Time window'), { target: { value: '7d' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/refresh/i);
    expect(screen.getByText('Sample Paste')).toBeInTheDocument();

    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(
      makePage([makePaste({ id: 'id-9', title: 'Recovered Paste' })])
    );
    fireEvent.click(within(alert).getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Recovered Paste')).toBeInTheDocument();
  });

  it('RED-D13 saveControl_doesNotNavigateToPasteDetail', async () => {
    asUser();
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(makePage([makePaste()]));
    vi.mocked(pasteApi.starPaste).mockResolvedValue({ pasteId: 'id-1', starsCount: 4, isStarred: true } as any);

    const LocationProbe = () => {
      const location = useLocation();
      return <div data-testid="location">{location.pathname}</div>;
    };

    render(
      <MemoryRouter initialEntries={['/discovery']}>
        <Routes>
          <Route
            path="/discovery"
            element={
              <>
                <DiscoveryPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/p/:id" element={<div>PASTE DETAIL VIEW</div>} />
        </Routes>
      </MemoryRouter>
    );

    const save = await screen.findByRole('button', { name: 'Save snippet Sample Paste' });
    fireEvent.click(save);

    await waitFor(() => expect(pasteApi.starPaste).toHaveBeenCalledWith('id-1'));
    expect(screen.queryByText('PASTE DETAIL VIEW')).toBeNull();
    expect(screen.getByTestId('location')).toHaveTextContent('/discovery');
  });

  it('RED-D14 duplicateSaveRequests_arePreventedWhilePending', async () => {
    asUser();
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(makePage([makePaste()]));
    let resolveStar: ((value: any) => void) | undefined;
    vi.mocked(pasteApi.starPaste).mockReturnValue(
      new Promise((resolve) => {
        resolveStar = resolve;
      }) as any
    );

    renderPage();
    const save = await screen.findByRole('button', { name: 'Save snippet Sample Paste' });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(pasteApi.starPaste).toHaveBeenCalledTimes(1);

    resolveStar?.({ pasteId: 'id-1', starsCount: 4, isStarred: true });
    await waitFor(() => expect(pasteApi.starPaste).toHaveBeenCalledTimes(1));
  });

  it('RED-D15 failedSave_doesNotMarkSavedAndReportsFailure', async () => {
    asUser();
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(makePage([makePaste()]));
    vi.mocked(pasteApi.starPaste).mockRejectedValue(new Error('nope'));

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Save snippet Sample Paste' }));

    expect(await screen.findByText(/couldn't save this snippet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save snippet Sample Paste' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove saved snippet sample paste/i })).toBeNull();
  });

  it('RED-D16 authenticatedUser_seedsSavedStateFromStarredEndpoint', async () => {
    asUser();
    vi.mocked(accountApi.getStarredPastes).mockResolvedValue([makePaste({ id: 'id-1' })]);
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(makePage([makePaste({ id: 'id-1' })]));

    renderPage();

    const saved = await screen.findByRole('button', { name: 'Remove saved snippet Sample Paste' });
    expect(accountApi.getStarredPastes).toHaveBeenCalled();

    fireEvent.click(saved);
    await waitFor(() => expect(pasteApi.unstarPaste).toHaveBeenCalledWith('id-1'));
  });

  it('RED-D17 anonymousUser_seesSingleLoginPromptAndNoSaveControl', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(makePage([makePaste()]));
    renderPage();
    await screen.findByText('Sample Paste');

    expect(screen.getAllByText('Log in to save')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /save snippet/i })).toBeNull();
  });

  it('RED-D18 tagLoadFailure_showsNoFakeTagsAndKeepsFeedUsable', async () => {
    vi.mocked(discoveryApi.getPublicTags).mockRejectedValue(new Error('tags down'));
    // Fixture note: omit card-level tags so the assertion below isolates the tag cloud.
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(makePage([makePaste({ tags: [] })]));

    renderPage();
    await screen.findByText('Sample Paste');

    expect(screen.queryByRole('button', { name: /#[a-z]/i })).toBeNull();
    expect(await screen.findByText(/popular tags are unavailable/i)).toBeInTheDocument();
  });

  it('RED-D19 duplicateBackendIds_renderStableUniqueKeys', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(
      makePage([makePaste({ id: 'dup', title: 'First Dup' }), makePaste({ id: 'dup', title: 'Second Dup' })])
    );

    renderPage();
    await screen.findByText('First Dup');
    expect(screen.getByText('Second Dup')).toBeInTheDocument();

    const keyWarnings = errorSpy.mock.calls.filter((call) => String(call[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
  });

  it('RED-D20 emptyExplore_showsClearFiltersInsideEmptyState', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([]));
    renderPage();

    await screen.findByRole('heading', { name: /no public pastes found/i });
    submitSearch('zzz');

    const emptyRegion = await screen.findByRole('region', { name: /no public pastes found/i });
    expect(within(emptyRegion).getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('RED-D21 controlsExposeAccessibleNamesAndFocus', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(
      makePage([makePaste()], { totalElements: 40, totalPages: 3, isLast: false })
    );
    renderPage();
    await screen.findByText('Sample Paste');

    expect(screen.getByLabelText('Search public snippets')).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
    expect(screen.getByLabelText('Time window')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort snippets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();

    const titleLinks = screen.getAllByRole('link', { name: 'Sample Paste' });
    expect(titleLinks).toHaveLength(1);
    expect(titleLinks[0]).toHaveAttribute('href', '/p/id-1');

    titleLinks[0].focus();
    expect(titleLinks[0]).toHaveFocus();
  });

  it('RED-D22 successfulSave_reflectsServerStarredState', async () => {
    asUser();
    // Fixture note: persistent (not once) so the card survives the post-save count refetch.
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([makePaste()]));
    vi.mocked(pasteApi.starPaste).mockResolvedValue({ pasteId: 'id-1', starsCount: 4, isStarred: true } as any);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Save snippet Sample Paste' }));

    expect(await screen.findByRole('button', { name: 'Remove saved snippet Sample Paste' })).toBeInTheDocument();
  });

  it('RED-D23 backgroundRefresh_showsSubtleStatusAndKeepsGrid', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValueOnce(makePage([makePaste()]));
    renderPage();
    await screen.findByText('Sample Paste');

    let resolveSecond: ((value: any) => void) | undefined;
    vi.mocked(discoveryApi.getDiscovery).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      }) as any
    );
    fireEvent.change(screen.getByLabelText('Time window'), { target: { value: '24h' } });

    expect(await screen.findByText(/updating results/i)).toBeInTheDocument();
    expect(screen.getByText('Sample Paste')).toBeInTheDocument();

    resolveSecond?.(makePage([makePaste()]));
  });
});
