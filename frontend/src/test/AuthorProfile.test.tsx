import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { DiscoveryPage } from '../features/discovery/pages/DiscoveryPage';
import { AuthorLink } from '../features/authors/components/AuthorLink';
import { PublicAuthorProfilePage } from '../features/authors/pages/PublicAuthorProfilePage';
import { authorProfileApi } from '../features/authors/api/authorProfileApi';
import { discoveryApi } from '../features/discovery/api/discoveryApi';
import { accountApi } from '../features/dashboard/api/accountApi';
import { useAuth } from '../features/auth/context/AuthContext';
import { ApiError } from '../lib/api-client/client';
import type { PublicAuthorProfile } from '../features/authors/api/authorProfileApi';
import type { PagedResponse, PasteSummary } from '../features/dashboard/api/accountApi';

vi.mock('../features/authors/api/authorProfileApi', () => ({
  authorProfileApi: {
    getAuthorProfile: vi.fn(),
    getAuthorPastes: vi.fn(),
  },
}));

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

const makePaste = (overrides: Partial<PasteSummary> & Record<string, unknown> = {}): PasteSummary =>
  ({
    id: 'id-1',
    title: 'Alpha Snippet',
    language: 'java',
    visibility: 'PUBLIC',
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

const makePage = (
  items: PasteSummary[],
  overrides: Partial<PagedResponse<PasteSummary>> = {}
): PagedResponse<PasteSummary> => ({
  items,
  page: 0,
  size: 18,
  totalElements: items.length,
  totalPages: items.length > 0 ? 1 : 0,
  isFirst: true,
  isLast: true,
  ...overrides,
});

const makeProfile = (overrides: Partial<PublicAuthorProfile> = {}): PublicAuthorProfile => ({
  username: 'alice',
  joinedAt: '2026-01-15T10:00:00Z',
  publicPasteCount: 12,
  totalViews: 345,
  totalSaves: 7,
  recentPastes: [
    makePaste({ id: 'p1', title: 'Alpha Snippet' }),
    makePaste({ id: 'p2', title: 'Beta Snippet' }),
    makePaste({ id: 'p3', title: 'Gamma Snippet' }),
  ],
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
};

const asGuest = () => {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  } as ReturnType<typeof useAuth>);
};

const renderDiscovery = () =>
  render(
    <MemoryRouter initialEntries={['/discovery']}>
      <DiscoveryPage />
      <LocationProbe />
    </MemoryRouter>
  );

const renderAuthorLink = (username: string) =>
  render(
    <MemoryRouter initialEntries={['/discovery']}>
      <AuthorLink username={username} />
    </MemoryRouter>
  );

const renderProfile = (username: string) =>
  render(
    <MemoryRouter initialEntries={[`/users/${username}`]}>
      <Routes>
        <Route path="/users/:username" element={<PublicAuthorProfilePage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );

const openAuthor = async (name = 'alice') => {
  const trigger = await screen.findByRole('button', { name: new RegExp(`by @${name}`, 'i') });
  fireEvent.click(trigger);
  return trigger;
};

describe('Public author profiles & developer discovery', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    asGuest();
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([]));
    vi.mocked(discoveryApi.getPublicTags).mockResolvedValue([]);
    vi.mocked(discoveryApi.getMostSaved).mockResolvedValue(makePage([]));
    vi.mocked(accountApi.getStarredPastes).mockResolvedValue([]);
    vi.mocked(authorProfileApi.getAuthorProfile).mockResolvedValue(makeProfile());
    vi.mocked(authorProfileApi.getAuthorPastes).mockResolvedValue(makePage([]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  // AFP-01
  it('discoveryCard_rendersAuthorAsDialogTrigger', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([makePaste()]));
    renderDiscovery();

    const trigger = await screen.findByRole('button', { name: /by @alice/i });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  // AFP-02
  it('authorButton_opensPopoverForThatAuthor', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([makePaste()]));
    renderDiscovery();

    await openAuthor();

    const dialog = await screen.findByRole('dialog', { name: /profile preview for alice/i });
    expect(dialog).toBeInTheDocument();
    expect(vi.mocked(authorProfileApi.getAuthorProfile).mock.calls[0][0]).toBe('alice');
    expect(vi.mocked(authorProfileApi.getAuthorProfile)).toHaveBeenCalledTimes(1);
  });

  // AFP-03
  it('authorButton_doesNotNavigateToPaste', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([makePaste()]));
    renderDiscovery();

    await openAuthor();

    expect(screen.getByTestId('location').textContent).toBe('/discovery');
  });

  // AFP-04
  it('popover_showsStatsAndRecentWork', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([makePaste()]));
    renderDiscovery();
    await openAuthor();

    const dialog = await screen.findByRole('dialog', { name: /profile preview for alice/i });
    expect(within(dialog).getByText(/12 public pastes/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/345 views/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/7 saves/i)).toBeInTheDocument();

    expect(within(dialog).getByText('Alpha Snippet')).toBeInTheDocument();
    expect(within(dialog).getByText('Beta Snippet')).toBeInTheDocument();
    expect(within(dialog).getByText('Gamma Snippet')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Alpha Snippet/i })).toHaveAttribute(
      'href',
      '/p/p1'
    );
  });

  // AFP-05
  it('popover_showsHonestEmptyStateWithoutPublicWork', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(makePage([makePaste()]));
    vi.mocked(authorProfileApi.getAuthorProfile).mockResolvedValue(
      makeProfile({ publicPasteCount: 0, totalViews: 0, totalSaves: 0, recentPastes: [] })
    );
    renderDiscovery();
    await openAuthor();

    const dialog = await screen.findByRole('dialog', { name: /profile preview for alice/i });
    expect(within(dialog).getByText(/no public work yet/i)).toBeInTheDocument();
    expect(within(dialog).queryByText('Alpha Snippet')).not.toBeInTheDocument();
  });

  // AFP-06
  it('popover_showsErrorAndRetries', async () => {
    vi.mocked(authorProfileApi.getAuthorProfile)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(makeProfile());
    renderAuthorLink('alice');

    await openAuthor();
    const dialog = await screen.findByRole('dialog', { name: /profile preview for alice/i });
    expect(await within(dialog).findByText(/couldn't load this profile/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /retry/i }));

    expect(await within(dialog).findByText(/12 public pastes/i)).toBeInTheDocument();
    expect(vi.mocked(authorProfileApi.getAuthorProfile)).toHaveBeenCalledTimes(2);
  });

  // AFP-07
  it('popover_closesOnEscape_andRestoresTriggerFocus', async () => {
    renderAuthorLink('alice');
    const trigger = await openAuthor();

    const dialog = await screen.findByRole('dialog', { name: /profile preview for alice/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /close profile preview/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(trigger);

    // Escape closes as well.
    fireEvent.click(trigger);
    await screen.findByRole('dialog', { name: /profile preview for alice/i });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(trigger);
  });

  // AFP-08
  it('popover_closesOnOutsidePointerDown', async () => {
    renderAuthorLink('alice');
    await openAuthor();
    await screen.findByRole('dialog', { name: /profile preview for alice/i });

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // AFP-09
  it('popover_ignoresStaleResponseWhenAuthorChanges', async () => {
    const aliceDeferred = deferred<PublicAuthorProfile>();
    const bobDeferred = deferred<PublicAuthorProfile>();
    vi.mocked(authorProfileApi.getAuthorProfile).mockImplementation((username: string) =>
      username === 'alice' ? aliceDeferred.promise : bobDeferred.promise
    );

    const { rerender } = renderAuthorLink('alice');
    await openAuthor('alice');

    rerender(
      <MemoryRouter initialEntries={['/discovery']}>
        <AuthorLink username="bob" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(vi.mocked(authorProfileApi.getAuthorProfile)).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      bobDeferred.resolve(
        makeProfile({
          username: 'bob',
          publicPasteCount: 2,
          recentPastes: [makePaste({ id: 'b1', title: 'Bob work', authorUsername: 'bob' })],
        })
      );
    });

    expect(await screen.findByText('Bob work')).toBeInTheDocument();

    await act(async () => {
      aliceDeferred.resolve(makeProfile({ recentPastes: [makePaste({ title: 'Alice work' })] }));
    });

    expect(screen.queryByText('Alice work')).not.toBeInTheDocument();
    expect(screen.getByText('Bob work')).toBeInTheDocument();
  });

  // AFP-10
  it('popover_deduplicatesPendingRequests', async () => {
    const pending = deferred<PublicAuthorProfile>();
    vi.mocked(authorProfileApi.getAuthorProfile).mockReturnValue(pending.promise);

    const { rerender } = renderAuthorLink('alice');
    await openAuthor('alice');

    await waitFor(() => {
      expect(vi.mocked(authorProfileApi.getAuthorProfile)).toHaveBeenCalledTimes(1);
    });

    rerender(
      <MemoryRouter initialEntries={['/discovery']}>
        <AuthorLink username="alice" />
      </MemoryRouter>
    );
    rerender(
      <MemoryRouter initialEntries={['/discovery']}>
        <AuthorLink username="alice" />
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(vi.mocked(authorProfileApi.getAuthorProfile)).toHaveBeenCalledTimes(1);
  });

  // AFP-11
  it('unavailableAuthor_isNotInteractive', async () => {
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue(
      makePage([makePaste({ authorUsername: null })])
    );
    renderDiscovery();

    expect(await screen.findByText('Author unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /author unavailable/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Unknown author')).not.toBeInTheDocument();
  });

  // AFP-12
  it('viewFullProfile_linksToAuthorPage', async () => {
    render(
      <MemoryRouter initialEntries={['/discovery']}>
        <Routes>
          <Route path="/discovery" element={<AuthorLink username="alice" />} />
          <Route path="/users/:username" element={<p>Profile route reached</p>} />
        </Routes>
      </MemoryRouter>
    );

    await openAuthor();
    const link = await screen.findByRole('link', { name: /view full profile/i });
    expect(link).toHaveAttribute('href', '/users/alice');

    fireEvent.click(link);
    expect(await screen.findByText('Profile route reached')).toBeInTheDocument();
  });

  // AFP-13
  it('profilePage_rendersPublicIdentityAndStats', async () => {
    vi.mocked(authorProfileApi.getAuthorProfile).mockResolvedValue(makeProfile());
    vi.mocked(authorProfileApi.getAuthorPastes).mockResolvedValue(
      makePage([makePaste({ id: 'p1', title: 'Alpha Snippet' })])
    );

    renderProfile('alice');

    expect(await screen.findByRole('heading', { level: 1, name: /alice/i })).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText(/12 public pastes/i)).toBeInTheDocument();
    expect(screen.getByText(/345 views/i)).toBeInTheDocument();
    expect(screen.getByText(/7 saves/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /public work/i })).toBeInTheDocument();
  });

  // AFP-14
  it('profilePage_rendersOnlyReturnedEligiblePastes', async () => {
    vi.mocked(authorProfileApi.getAuthorPastes).mockResolvedValue(
      makePage([
        makePaste({ id: 'p1', title: 'Alpha Snippet' }),
        makePaste({ id: 'p2', title: 'Beta Snippet' }),
      ])
    );

    renderProfile('alice');

    expect(await screen.findByText('Alpha Snippet')).toBeInTheDocument();
    expect(screen.getByText('Beta Snippet')).toBeInTheDocument();
    expect(screen.queryByText('Gamma Snippet')).not.toBeInTheDocument();
  });

  // AFP-15
  it('profilePage_paginatesServerSideAndUpdatesUrl', async () => {
    vi.mocked(authorProfileApi.getAuthorPastes).mockImplementation(
      async (_username: string, page = 0) =>
        page === 0
          ? makePage([makePaste({ id: 'p1', title: 'Page one item' })], {
              totalElements: 2,
              totalPages: 2,
              isLast: false,
            })
          : makePage([makePaste({ id: 'p2', title: 'Page two item' })], {
              page: 1,
              totalElements: 2,
              totalPages: 2,
              isFirst: false,
              isLast: true,
            })
    );

    renderProfile('alice');
    expect(await screen.findByText('Page one item')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText('Page two item')).toBeInTheDocument();
    const calls = vi.mocked(authorProfileApi.getAuthorPastes).mock.calls;
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('alice');
    expect(last[1]).toBe(1);
    expect(last[2]).toBe(18);
    expect(screen.getByTestId('location').textContent).toContain('page=2');
  });

  // AFP-16
  it('profilePage_showsNotFoundState', async () => {
    vi.mocked(authorProfileApi.getAuthorProfile).mockRejectedValue(
      new ApiError({ title: 'Not Found', status: 404, detail: 'Author not found.' })
    );

    renderProfile('ghost');

    expect(await screen.findByText(/profile not found/i)).toBeInTheDocument();
    expect(screen.queryByText(/public work/i)).not.toBeInTheDocument();
  });

  // AFP-17
  it('profilePage_showsEmptyState', async () => {
    vi.mocked(authorProfileApi.getAuthorProfile).mockResolvedValue(
      makeProfile({ publicPasteCount: 0, totalViews: 0, totalSaves: 0, recentPastes: [] })
    );
    vi.mocked(authorProfileApi.getAuthorPastes).mockResolvedValue(makePage([]));

    renderProfile('alice');

    expect(await screen.findByText(/no public work yet/i)).toBeInTheDocument();
  });

  // AFP-18
  it('profilePage_retriesAfterFailure', async () => {
    vi.mocked(authorProfileApi.getAuthorProfile)
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(makeProfile());

    renderProfile('alice');

    expect(await screen.findByText(/couldn't load this profile/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByRole('heading', { level: 1, name: /alice/i })).toBeInTheDocument();
  });

  // AFP-19
  it('anonymousVisitor_canOpenProfile', async () => {
    asGuest();
    vi.mocked(authorProfileApi.getAuthorProfile).mockResolvedValue(makeProfile());

    renderProfile('alice');

    expect(await screen.findByRole('heading', { level: 1, name: /alice/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /public work/i })).toBeInTheDocument();
  });

  // AFP-20
  it('mostSavedTab_authorTriggerOpensPopover', async () => {
    vi.mocked(discoveryApi.getMostSaved).mockResolvedValue(
      makePage([makePaste({ id: 'saved-1', title: 'Saved Snippet' })])
    );
    renderDiscovery();

    fireEvent.click(await screen.findByRole('button', { name: 'Most saved' }));

    expect(await screen.findByText('Saved Snippet')).toBeInTheDocument();
    await openAuthor();

    expect(await screen.findByRole('dialog', { name: /profile preview for alice/i })).toBeInTheDocument();
  });

  // AFP-21
  it('mobilePopover_isModalDialogWithFocusTrap', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('640px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    renderAuthorLink('alice');
    await openAuthor();

    const dialog = await screen.findByRole('dialog', { name: /profile preview for alice/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(dialog).getByRole('button', { name: /close profile preview/i })
      );
    });
  });
});
