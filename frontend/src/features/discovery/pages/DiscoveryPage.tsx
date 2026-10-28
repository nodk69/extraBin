import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../../components/ui/PaperIcon';
import { DiscoveryPageSkeleton } from '../../../components/ui/SkeletonLayouts';
import { Select } from '../../../components/ui/dropdown';
import { discoveryApi, DiscoveryFilters, PublicTag, DISCOVERY_PAGE_SIZE } from '../api/discoveryApi';
import { pasteApi } from '../../pastes/api/pasteApi';
import { useAuth } from '../../auth/context/AuthContext';
import { accountApi, PagedResponse, PasteSummary } from '../../dashboard/api/accountApi';
import { authorProfileApi, FOLLOWING_CHANGED_EVENT } from '../../authors/api/authorProfileApi';
import { DiscoveryCard } from '../components/DiscoveryCard';
import { useDiscoveryFeed, FeedResult } from './useDiscoveryFeed';
import '../discovery.css';

const LANGUAGE_OPTIONS = [
  { value: 'all', label: 'All languages' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'cpp', label: 'C++' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
];

type DiscoveryTab = 'explore' | 'trending' | 'most-saved' | 'following';
const readTab = (value: string | null): DiscoveryTab =>
  value === 'trending' || value === 'most-saved' || value === 'following' ? value : 'explore';
const pageResult = (result: PagedResponse<PasteSummary>): FeedResult => ({
  items: result.items,
  next: result.page + 1,
  hasMore: !(result.isLast ?? (result.page + 1 >= result.totalPages)),
  totalElements: result.totalElements,
});

const toId = (item?: PasteSummary | null): string => {
  if (item?.id === null || item?.id === undefined) return '';
  const value = String(item.id).trim();
  return value;
};

const pluralizeCount = (count: number): string =>
  `${count} ${count === 1 ? 'public paste' : 'public pastes'}`;

export const DiscoveryPage: React.FC = () => {
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = readTab(searchParams.get('tab'));
  const [tags, setTags] = useState<PublicTag[]>([]);
  const [tagsFailed, setTagsFailed] = useState(false);

  const [languages, setLanguages] = useState({ explore: 'all', trending: 'all', 'most-saved': 'all' });
  const selectedLanguage = tab === 'following' ? 'all' : languages[tab];
  const setSelectedLanguage = (value: string) => {
    if (tab !== 'following') setLanguages((current) => ({ ...current, [tab]: value }));
  };
  const [searchInput, setSearchInput] = useState('');
  const [committedQ, setCommittedQ] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [windowFilter, setWindowFilter] = useState<'24h' | '7d' | '30d' | 'all'>('all');
  const [trendingWindow, setTrendingWindow] = useState<'24h' | '7d' | '30d'>('24h');
  const [sortFilter, setSortFilter] = useState<'newest' | 'oldest' | 'updated'>('newest');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);


  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const savingRef = useRef<Set<string>>(new Set());
  const filters: DiscoveryFilters = {
    q: committedQ || undefined,
    tag: tagFilter || undefined,
    language: languages.explore === 'all' ? undefined : languages.explore,
    window: windowFilter === 'all' ? undefined : windowFilter,
    sort: sortFilter === 'newest' ? undefined : sortFilter,
  };
  const explore = useDiscoveryFeed(JSON.stringify(filters), tab === 'explore', async (position, signal) =>
    pageResult(await discoveryApi.getDiscovery(typeof position === 'number' ? position : 0, DISCOVERY_PAGE_SIZE, filters, signal))
  );
  const trending = useDiscoveryFeed(JSON.stringify([trendingWindow, languages.trending]), tab === 'trending', async (position, signal) =>
    pageResult(await discoveryApi.getTrending(typeof position === 'number' ? position : 0, DISCOVERY_PAGE_SIZE, trendingWindow,
      languages.trending === 'all' ? undefined : languages.trending, signal))
  );
  const mostSaved = useDiscoveryFeed(languages['most-saved'], tab === 'most-saved', async (position, signal) =>
    pageResult(await discoveryApi.getMostSaved(typeof position === 'number' ? position : 0, DISCOVERY_PAGE_SIZE,
      languages['most-saved'] === 'all' ? undefined : languages['most-saved'], signal))
  );
  const identity = isAuthenticated ? String(user?.id ?? user?.username ?? 'authenticated') : 'guest';
  const following = useDiscoveryFeed(identity, tab === 'following' && isAuthenticated && !authLoading, async (position, signal) => {
    const result = await authorProfileApi.getFollowingFeedCursor(typeof position === 'string' ? position : undefined, DISCOVERY_PAGE_SIZE, signal);
    return { items: result.items, next: result.nextCursor, hasMore: result.hasMore };
  });
  const followingReset = useRef(following.reset);
  followingReset.current = following.reset;
  useEffect(() => {
    if (!isAuthenticated) return;
    const revalidate = () => followingReset.current();
    window.addEventListener(FOLLOWING_CHANGED_EVENT, revalidate);
    window.addEventListener('focus', revalidate);
    return () => {
      window.removeEventListener(FOLLOWING_CHANGED_EVENT, revalidate);
      window.removeEventListener('focus', revalidate);
    };
  }, [identity, isAuthenticated]);

  // Public tag cloud for the discovery filter bar. A failure never fabricates tags.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (cancelled) return [];
      return discoveryApi.getPublicTags(controller.signal);
    }).then((res) => {
        if (cancelled) return;
        setTags(res || []);
        setTagsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setTags([]);
        setTagsFailed(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // Seed the saved state for authenticated viewers from the real starred endpoint.
  useEffect(() => {
    if (!isAuthenticated) {
      setStarredIds(new Set());
      return;
    }
    let cancelled = false;
    setStarredIds(new Set());
    Promise.resolve().then(() => cancelled ? [] : accountApi.getStarredPastes())
      .then((items) => {
        if (cancelled) return;
        const ids = (items || [])
          .map((item) => toId(item))
          .filter((value) => value.length > 0);
        setStarredIds(new Set(ids));
      })
      .catch(() => {
        // A failed seed simply leaves the saved state empty; nothing is fabricated.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, identity]);

  const applyFilterChange = (apply: () => void) => apply();

  // Debounce search input (350ms) to provide smooth typo-tolerant search-as-you-type
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      setCommittedQ(trimmed.length > 0 ? trimmed : null);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    applyFilterChange(() => setCommittedQ(searchInput.trim() || null));
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setCommittedQ(null);
    setTagFilter(null);
    setWindowFilter('all');
    setSortFilter('newest');
    setSelectedLanguage('all');
  };

  const handleTagToggle = (name: string) => {
    applyFilterChange(() => setTagFilter((prev) => (prev === name ? null : name)));
  };

  const handleLanguageChange = (value: string) => setSelectedLanguage(value);

  const handleToggleSave = async (id: string, wasSaved: boolean) => {
    if (!isAuthenticated) return;
    if (!id || savingRef.current.has(id)) return;
    savingRef.current.add(id);
    setSavingIds((prev) => new Set(prev).add(id));
    setSaveFeedback(null);
    try {
      if (wasSaved) {
        await pasteApi.unstarPaste(id);
        setStarredIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        await pasteApi.starPaste(id);
        setStarredIds((prev) => new Set(prev).add(id));
      }
      // Counts are only ever read back from the server, never adjusted locally.
      explore.refresh();
      trending.refresh();
      mostSaved.refresh();
      following.refresh();
    } catch {
      setSaveFeedback("Couldn't save this snippet. Please try again.");
    } finally {
      savingRef.current.delete(id);
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleSwitchTab = (next: DiscoveryTab) => {
    if (next === tab) return;
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      if (next === 'explore') {
        nextParams.delete('tab');
      } else {
        nextParams.set('tab', next);
      }
      return nextParams;
    }, { replace: true });
  };

  const activeFeed = tab === 'explore' ? explore : tab === 'trending' ? trending : tab === 'most-saved' ? mostSaved : following;
  const items = activeFeed.items;
  const activeTabLoading = !activeFeed.loaded;
  const titles = { explore: 'Latest public pastes', trending: 'Trending pastes', 'most-saved': 'Most saved', following: 'Following Feed' };
  const errors = {
    explore: 'Failed to connect to registry', trending: 'Could not load trending snippets',
    'most-saved': 'Could not load most-saved snippets', following: 'Could not load your Following feed',
  };
  const emptyTitles = {
    explore: 'No public pastes found', trending: 'No trending snippets yet',
    'most-saved': 'No saved snippets yet', following: 'Your Following feed is quiet',
  };

  const hasActiveFilters = Boolean(
    committedQ || tagFilter || windowFilter !== 'all' || sortFilter !== 'newest' || selectedLanguage !== 'all'
  );

  const renderGrid = (refreshing: boolean) => (
    <div className={`discovery-grid${refreshing ? ' is-refreshing' : ''}`}>
      {items.map((item, index) => {
        const id = toId(item);
        return (
          <DiscoveryCard
            key={`${id || 'unknown'}-${index}`}
            item={item}
            isAuthenticated={isAuthenticated}
            isSaved={id.length > 0 && starredIds.has(id)}
            isSaving={id.length > 0 && savingIds.has(id)}
            onToggleSave={handleToggleSave}
            onSelectTag={tab === 'explore' ? handleTagToggle : undefined}
            fromTab={tab}
          />
        );
      })}
    </div>
  );

  return (
    <div className="workspace discovery-page">
      <header className="discovery-header">
        <div className="discovery-header__text">
          <span className="discovery-eyebrow">COMMUNITY / DISCOVER</span>
          <h1 className="discovery-title">Explore public pastes</h1>
          <p className="discovery-subtitle">
            Browse snippets, configs and algorithms shared by the ExtraBin community.
          </p>
        </div>

        <div className="discovery-header__row">
          <nav className="discovery-views" aria-label="Discovery views">
            <button
              type="button"
              className={`discovery-view-tab${tab === 'explore' ? ' is-active' : ''}`}
              aria-pressed={tab === 'explore'}
              onClick={() => handleSwitchTab('explore')}
            >
              Explore
            </button>
            <button
              type="button"
              className={`discovery-view-tab${tab === 'trending' ? ' is-active' : ''}`}
              aria-pressed={tab === 'trending'}
              onClick={() => handleSwitchTab('trending')}
            >
              Trending
            </button>
            <button
              type="button"
              className={`discovery-view-tab${tab === 'most-saved' ? ' is-active' : ''}`}
              aria-pressed={tab === 'most-saved'}
              onClick={() => handleSwitchTab('most-saved')}
            >
              Most saved
            </button>
            <button
              type="button"
              className={`discovery-view-tab${tab === 'following' ? ' is-active' : ''}`}
              aria-pressed={tab === 'following'}
              onClick={() => handleSwitchTab('following')}
            >
              Following Feed
            </button>
          </nav>
        </div>
      </header>

      {tab !== 'following' && (
        <section className="discovery-panel" aria-label="Search and filter public pastes">
        {tab === 'explore' && (
          <form className="discovery-search" role="search" onSubmit={handleSearchSubmit}>
            <div className="discovery-search__field">
              <label className="discovery-visually-hidden" htmlFor="discovery-search-input">
                Search public snippets
              </label>
              <span className="discovery-search__icon" aria-hidden="true">
                <Icon name="search" size={14} />
              </span>
              <input
                id="discovery-search-input"
                className="discovery-search__input"
                type="text"
                value={searchInput}
                placeholder="Search public snippets…"
                onChange={(event) => setSearchInput(event.target.value)}
              />
              {/* Embedded search button inside right side of search field */}
              <button
                type="submit"
                className="discovery-search__submit-embedded"
                aria-label="Search"
                title="Search"
              >
                <Icon name="search" size={14} />
              </button>
            </div>
            {/* Desktop / Laptop outer search button */}
            <button type="submit" className="discovery-search__submit">
              Search
            </button>
          </form>
        )}

        {/* Mobile Advance Filter Corner Link / Button */}
        <div className="discovery-mobile-corner-bar">
          <button
            type="button"
            className="discovery-adv-filter-link"
            onClick={() => setIsMobileFiltersOpen(true)}
            aria-expanded={isMobileFiltersOpen}
            aria-controls="discovery-filters-group"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>Advance filter</span>
            {hasActiveFilters && (
              <span className="discovery-mobile-filter-badge" aria-label="Active filters applied">
                {[
                  selectedLanguage !== 'all',
                  tab === 'explore' && windowFilter !== 'all',
                  tab === 'explore' && sortFilter !== 'newest',
                  tab === 'explore' && Boolean(tagFilter),
                  tab === 'trending' && trendingWindow !== '24h',
                ].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Backdrop for mobile popup card */}
        {isMobileFiltersOpen && (
          <div
            className="discovery-filters-backdrop"
            onClick={() => setIsMobileFiltersOpen(false)}
            aria-hidden="true"
          />
        )}

        <div
          id="discovery-filters-group"
          className={`discovery-filters${isMobileFiltersOpen ? ' is-mobile-open' : ''}`}
        >
          {/* Header for mobile popup card */}
          <div className="discovery-filters__card-header">
            <span className="discovery-filters__card-title">Filter Snippets</span>
            <button
              type="button"
              className="discovery-filters__card-close"
              onClick={() => setIsMobileFiltersOpen(false)}
              aria-label="Close filters"
            >
              ✕
            </button>
          </div>
          <div className="discovery-field">
            <label className="discovery-field__label" htmlFor="discovery-language">
              Language
            </label>
            <Select
              id="discovery-language"
              value={selectedLanguage}
              onChange={(val) => handleLanguageChange(val)}
              options={LANGUAGE_OPTIONS}
              searchable
              menuWidth={220}
              size="md"
              ariaLabel="Filter by programming language"
            />
          </div>

          {tab === 'trending' && (
            <div className="discovery-field">
              <label className="discovery-field__label" htmlFor="trending-window">
                Trending window
              </label>
              <Select
                id="trending-window"
                value={trendingWindow}
                onChange={(val) => setTrendingWindow(val as '24h' | '7d' | '30d')}
                options={[
                  { value: '24h', label: 'Last 24 hours' },
                  { value: '7d', label: 'Last 7 days' },
                  { value: '30d', label: 'Last 30 days' },
                ]}
                menuWidth={180}
                size="md"
                ariaLabel="Filter trending time window"
              />
            </div>
          )}

          {tab === 'explore' && (
            <>
              <div className="discovery-field">
                <label className="discovery-field__label" htmlFor="discovery-window">
                  Time window
                </label>
                <Select
                  id="discovery-window"
                  value={windowFilter}
                  onChange={(val) =>
                    applyFilterChange(() =>
                      setWindowFilter(val as '24h' | '7d' | '30d' | 'all')
                    )
                  }
                  options={[
                    { value: 'all', label: 'All time' },
                    { value: '24h', label: 'Last 24 hours' },
                    { value: '7d', label: 'Last 7 days' },
                    { value: '30d', label: 'Last 30 days' },
                  ]}
                  menuWidth={180}
                  size="md"
                  ariaLabel="Filter by time window"
                />
              </div>

              <div className="discovery-field">
                <label className="discovery-field__label" htmlFor="discovery-sort">
                  Sort snippets
                </label>
                <Select
                  id="discovery-sort"
                  value={sortFilter}
                  onChange={(val) =>
                    applyFilterChange(() =>
                      setSortFilter(val as 'newest' | 'oldest' | 'updated')
                    )
                  }
                  options={[
                    { value: 'newest', label: 'Newest first' },
                    { value: 'oldest', label: 'Oldest first' },
                    { value: 'updated', label: 'Recently updated' },
                  ]}
                  menuWidth={200}
                  size="md"
                  ariaLabel="Sort discovery snippets"
                />
              </div>

              <div className="discovery-field">
                <label className="discovery-field__label" htmlFor="discovery-tag">
                  Popular tags
                </label>
                <Select
                  id="discovery-tag"
                  value={tagFilter || 'all'}
                  onChange={(val) =>
                    applyFilterChange(() =>
                      setTagFilter(val === 'all' ? null : val)
                    )
                  }
                  options={[
                    { value: 'all', label: 'All tags' },
                    ...tags.map((t) => ({
                      value: t.name,
                      label: `#${t.name}`,
                      hint: `${t.pasteCount}`,
                    })),
                  ]}
                  searchable={tags.length > 5}
                  menuWidth={200}
                  size="md"
                  ariaLabel="Filter by popular tag"
                  disabled={tagsFailed || tags.length === 0}
                />
                {tagsFailed && (
                  <span className="discovery-tags__note text-[11px] text-[#8c8980]">
                    Popular tags are unavailable right now. Search still works.
                  </span>
                )}
              </div>
            </>
          )}

          {/* Mobile popup card footer button */}
          <div className="discovery-filters__card-footer">
            <button
              type="button"
              className="discovery-filters__card-apply"
              onClick={() => setIsMobileFiltersOpen(false)}
            >
              Apply Filters
            </button>
          </div>
        </div>

        {tab === 'explore' && hasActiveFilters && (
          <div className="discovery-active-filters">
            <div className="discovery-active-filters__list">
              {committedQ && <span className="discovery-active-chip">&ldquo;{committedQ}&rdquo;</span>}
              {tagFilter && (
                <button
                  type="button"
                  className="discovery-active-chip"
                  aria-label={`Remove tag filter ${tagFilter}`}
                  onClick={() => applyFilterChange(() => setTagFilter(null))}
                >
                  #{tagFilter}
                  <span className="discovery-active-chip__icon" aria-hidden="true">
                    ×
                  </span>
                </button>
              )}
              {selectedLanguage !== 'all' && (
                <span className="discovery-active-chip">{selectedLanguage}</span>
              )}
              {windowFilter !== 'all' && <span className="discovery-active-chip">{windowFilter}</span>}
              {sortFilter !== 'newest' && <span className="discovery-active-chip">{sortFilter}</span>}
            </div>
            <button type="button" className="discovery-clear" onClick={handleClearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </section>
      )}

      {!isAuthenticated && (
        <div className="discovery-login-prompt">
          <span>Want to keep snippets for later?</span>
          <Link to="/login">Log in to save</Link>
        </div>
      )}

      {saveFeedback && (
        <div className="discovery-alert" role="alert">
          <span>{saveFeedback}</span>
        </div>
      )}

      <div className="discovery-results">
        <h2 className="discovery-results__title">{titles[tab]}</h2>
        {!activeTabLoading && activeFeed.totalElements !== undefined && (
          <span className="discovery-results__count">{pluralizeCount(activeFeed.totalElements)}</span>
        )}
      </div>

      {activeFeed.error && activeFeed.loaded && (
        <div className="discovery-alert" role="alert">
          <span>{activeFeed.failed === 'more' ? 'Could not load more snippets.' : 'Could not refresh results.'} Showing the last loaded snippets.</span>
          <button type="button" className="discovery-alert__retry" onClick={activeFeed.retry} disabled={activeFeed.loading}>
            <Icon name="refresh" size={13} /><span>Retry</span>
          </button>
        </div>
      )}
      {activeFeed.loading && activeFeed.loaded && (
        <div className="discovery-status" role="status">
          <span className="discovery-status__dot" aria-hidden="true" />
          <span>Updating results…</span>
        </div>
      )}

      {tab === 'following' && authLoading ? (
        <DiscoveryPageSkeleton resultsOnly />
      ) : tab === 'following' && !isAuthenticated ? (
        <section className="discovery-empty" aria-labelledby="following-login-heading">
          <h3 id="following-login-heading" className="discovery-empty__title">Log in to see your Following feed</h3>
          <p className="discovery-empty__body">Recent public pastes from developers you follow appear here.</p>
          <Link to="/login" className="discovery-empty__action">Log in</Link>
          <Link to="/developers" className="discovery-empty__action">Discover developers</Link>
        </section>
      ) : activeFeed.error && !activeFeed.loaded ? (
        <section className="discovery-state" aria-label={errors[tab]}>
          <div className="discovery-state__icon" aria-hidden="true"><Icon name="alert" size={24} /></div>
          <h3 className="discovery-state__title">{errors[tab]}</h3>
          <p className="discovery-state__body">{tab === 'explore' ? 'Unable to load public pastes. Please check your network connection.' : 'Please try again in a moment.'}</p>
          <button type="button" className="discovery-state__action" onClick={activeFeed.retry} disabled={activeFeed.loading}>
            <Icon name="refresh" size={14} /><span>{tab === 'explore' ? 'Retry Connection' : 'Retry'}</span>
          </button>
        </section>
      ) : activeTabLoading ? (
        <DiscoveryPageSkeleton resultsOnly />
      ) : items.length === 0 ? (
        <section className="discovery-empty" role="region" aria-labelledby="discovery-empty-heading">
          <div className="discovery-empty__icon" aria-hidden="true"><Icon name="file" size={26} /></div>
          <h3 id="discovery-empty-heading" className="discovery-empty__title">{emptyTitles[tab]}</h3>
          <p className="discovery-empty__body">
            {tab === 'following' ? 'Follow developers to see their eligible public pastes here. Your network may not have published any yet.'
              : tab === 'trending' ? 'Pastes with recent views and saves will appear here.'
              : tab === 'most-saved' ? 'Use the Save button on a public snippet to add it here.'
              : hasActiveFilters ? 'No eligible public snippets match these filters. Try clearing them or a different search.'
              : 'Be the first to publish a public snippet to the community registry.'}
          </p>
          {tab === 'following' && <Link to="/developers" className="discovery-empty__action">Discover developers</Link>}
          {tab === 'explore' && hasActiveFilters && (
            <button type="button" className="discovery-empty__action" onClick={handleClearFilters}>
              <Icon name="refresh" size={14} /><span>Clear filters</span>
            </button>
          )}
        </section>
      ) : renderGrid(activeFeed.loading)}

      {activeFeed.loaded && activeFeed.hasMore && !activeFeed.error && (
        <div className="discovery-pagination">
          <span>{items.length} snippets loaded</span>
          <div className="discovery-pagination__controls">
            <button type="button" className="discovery-pagination__btn" onClick={activeFeed.loadMore} disabled={activeFeed.loading}>
              {activeFeed.loading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscoveryPage;
