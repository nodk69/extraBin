import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../../components/ui/PaperIcon';
import { Loading } from '../../../components/ui/Loading';
import { Select } from '../../../components/ui/dropdown';
import { discoveryApi, DiscoveryFilters, PublicTag } from '../api/discoveryApi';
import { pasteApi } from '../../pastes/api/pasteApi';
import { useAuth } from '../../auth/context/AuthContext';
import { accountApi, PagedResponse, PasteSummary } from '../../dashboard/api/accountApi';
import { DiscoveryCard } from '../components/DiscoveryCard';
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

const isAbortError = (err: unknown): boolean => {
  const errorObj = err as { name?: string };
  return errorObj?.name === 'CanceledError' || errorObj?.name === 'AbortError';
};

const toId = (item?: PasteSummary | null): string => {
  if (item?.id === null || item?.id === undefined) return '';
  const value = String(item.id).trim();
  return value;
};

const pluralizeCount = (count: number): string =>
  `${count} ${count === 1 ? 'public paste' : 'public pastes'}`;

export const DiscoveryPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTabParam = searchParams.get('tab');
  const initialTab: 'explore' | 'trending' | 'most-saved' =
    initialTabParam === 'trending' || initialTabParam === 'most-saved'
      ? initialTabParam
      : 'explore';

  const [tab, setTab] = useState<'explore' | 'trending' | 'most-saved'>(initialTab);

  // Sync tab state when searchParams changes (e.g. browser back/forward)
  useEffect(() => {
    const currentParam = searchParams.get('tab');
    const targetTab: 'explore' | 'trending' | 'most-saved' =
      currentParam === 'trending' || currentParam === 'most-saved'
        ? currentParam
        : 'explore';
    if (targetTab !== tab) {
      setTab(targetTab);
    }
  }, [searchParams]);
  const [data, setData] = useState<PagedResponse<PasteSummary> | null>(null);
  const [trendingData, setTrendingData] = useState<PagedResponse<PasteSummary> | null>(null);
  const [mostSavedData, setMostSavedData] = useState<PagedResponse<PasteSummary> | null>(null);
  const [tags, setTags] = useState<PublicTag[]>([]);
  const [tagsFailed, setTagsFailed] = useState(false);

  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [committedQ, setCommittedQ] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [windowFilter, setWindowFilter] = useState<'24h' | '7d' | '30d' | 'all'>('all');
  const [trendingWindow, setTrendingWindow] = useState<'24h' | '7d' | '30d'>('24h');
  const [sortFilter, setSortFilter] = useState<'newest' | 'oldest' | 'updated'>('newest');

  const [page, setPage] = useState(0);
  const [exploreTick, setExploreTick] = useState(0);
  const [trendingPage, setTrendingPage] = useState(0);
  const [trendingTick, setTrendingTick] = useState(0);
  const [mostSavedPage, setMostSavedPage] = useState(0);
  const [mostSavedTick, setMostSavedTick] = useState(0);

  const [isFetching, setIsFetching] = useState(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const [mostSavedLoading, setMostSavedLoading] = useState(false);
  const [mostSavedError, setMostSavedError] = useState<string | null>(null);

  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const exploreReqIdRef = useRef(0);
  const trendingReqIdRef = useRef(0);
  const mostSavedReqIdRef = useRef(0);
  const exploreAbortRef = useRef<AbortController | null>(null);
  const trendingAbortRef = useRef<AbortController | null>(null);
  const mostSavedAbortRef = useRef<AbortController | null>(null);
  const savingRef = useRef<Set<string>>(new Set());

  // Explore feed: server-side search/filter/sort; every filter change refetches from page 0.
  useEffect(() => {
    if (tab !== 'explore') return;
    if (exploreAbortRef.current) {
      exploreAbortRef.current.abort();
    }
    const controller = new AbortController();
    exploreAbortRef.current = controller;
    const id = ++exploreReqIdRef.current;

    setIsFetching(true);
    setExploreError(null);

    const filters: DiscoveryFilters = {
      q: committedQ || undefined,
      tag: tagFilter || undefined,
      language: selectedLanguage === 'all' ? undefined : selectedLanguage,
      window: windowFilter === 'all' ? undefined : windowFilter,
      sort: sortFilter === 'newest' ? undefined : sortFilter,
    };

    discoveryApi
      .getDiscovery(page, 18, filters, controller.signal)
      .then((res) => {
        if (id !== exploreReqIdRef.current) return;
        setData(res);
        setIsFetching(false);
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || id !== exploreReqIdRef.current) return;
        setExploreError('Unable to load public pastes. Please check your network connection.');
        setIsFetching(false);
      });

    return () => controller.abort();
  }, [tab, page, committedQ, tagFilter, selectedLanguage, windowFilter, sortFilter, exploreTick]);

  // Public tag cloud for the discovery filter bar. A failure never fabricates tags.
  useEffect(() => {
    let cancelled = false;
    discoveryApi
      .getPublicTags()
      .then((res) => {
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
    };
  }, []);

  // Trending tab: genuine engagement velocity over sliding windows (24h, 7d, 30d).
  useEffect(() => {
    if (tab !== 'trending') return;
    if (trendingAbortRef.current) {
      trendingAbortRef.current.abort();
    }
    const controller = new AbortController();
    trendingAbortRef.current = controller;
    const id = ++trendingReqIdRef.current;

    setTrendingLoading(true);
    setTrendingError(null);

    discoveryApi
      .getTrending(
        trendingPage,
        18,
        trendingWindow,
        selectedLanguage === 'all' ? undefined : selectedLanguage,
        controller.signal
      )
      .then((res) => {
        if (id !== trendingReqIdRef.current) return;
        setTrendingData(res);
        setTrendingLoading(false);
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || id !== trendingReqIdRef.current) return;
        setTrendingError('Could not load trending snippets.');
        setTrendingLoading(false);
      });

    return () => controller.abort();
  }, [tab, trendingPage, trendingWindow, selectedLanguage, trendingTick]);

  // Most-saved tab: dedicated endpoint, never fabricates popularity from other signals.
  useEffect(() => {
    if (tab !== 'most-saved') return;
    if (mostSavedAbortRef.current) {
      mostSavedAbortRef.current.abort();
    }
    const controller = new AbortController();
    mostSavedAbortRef.current = controller;
    const id = ++mostSavedReqIdRef.current;

    setMostSavedLoading(true);
    setMostSavedError(null);

    discoveryApi
      .getMostSaved(mostSavedPage, 18, selectedLanguage === 'all' ? undefined : selectedLanguage, controller.signal)
      .then((res) => {
        if (id !== mostSavedReqIdRef.current) return;
        setMostSavedData(res);
        setMostSavedLoading(false);
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || id !== mostSavedReqIdRef.current) return;
        setMostSavedError('Could not load most-saved snippets.');
        setMostSavedLoading(false);
      });

    return () => controller.abort();
  }, [tab, mostSavedPage, selectedLanguage, mostSavedTick]);

  // Seed the saved state for authenticated viewers from the real starred endpoint.
  useEffect(() => {
    if (!isAuthenticated) {
      setStarredIds(new Set());
      return;
    }
    let cancelled = false;
    Promise.resolve(accountApi.getStarredPastes())
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
  }, [isAuthenticated]);

  useEffect(() => {
    return () => {
      if (exploreAbortRef.current) exploreAbortRef.current.abort();
      if (trendingAbortRef.current) trendingAbortRef.current.abort();
      if (mostSavedAbortRef.current) mostSavedAbortRef.current.abort();
    };
  }, []);

  const applyFilterChange = (apply: () => void) => {
    setPage(0);
    apply();
  };

  // Debounce search input (350ms) to provide smooth typo-tolerant search-as-you-type
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      setCommittedQ((prev) => {
        const next = trimmed.length > 0 ? trimmed : null;
        if (prev !== next) {
          setPage(0);
          return next;
        }
        return prev;
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    applyFilterChange(() => setCommittedQ(searchInput.trim() || null));
  };

  const handleClearFilters = () => {
    setPage(0);
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

  const handleLanguageChange = (value: string) => {
    if (tab === 'trending') {
      setTrendingPage(0);
      setSelectedLanguage(value);
      return;
    }
    if (tab === 'most-saved') {
      setMostSavedPage(0);
      setSelectedLanguage(value);
      return;
    }
    applyFilterChange(() => setSelectedLanguage(value));
  };

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
      if (tab === 'trending') {
        setTrendingTick((t) => t + 1);
      } else if (tab === 'most-saved') {
        setMostSavedTick((t) => t + 1);
      } else {
        setExploreTick((t) => t + 1);
      }
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

  const handleSwitchTab = (next: 'explore' | 'trending' | 'most-saved') => {
    if (next === tab) return;
    setTab(next);
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      if (next === 'explore') {
        nextParams.delete('tab');
      } else {
        nextParams.set('tab', next);
      }
      return nextParams;
    }, { replace: true });

    if (next === 'trending') {
      setTrendingPage(0);
      setTrendingTick((t) => t + 1);
    } else if (next === 'most-saved') {
      setMostSavedPage(0);
      setMostSavedTick((t) => t + 1);
    } else {
      setPage(0);
    }
  };

  const items = tab === 'explore'
    ? (data?.items || [])
    : tab === 'trending'
      ? (trendingData?.items || [])
      : (mostSavedData?.items || []);

  const currentPage = tab === 'explore'
    ? (data?.page ?? page)
    : tab === 'trending'
      ? (trendingData?.page ?? trendingPage)
      : (mostSavedData?.page ?? mostSavedPage);

  const totalPages = tab === 'explore'
    ? (data?.totalPages ?? 0)
    : tab === 'trending'
      ? (trendingData?.totalPages ?? 0)
      : (mostSavedData?.totalPages ?? 0);

  const totalElements = tab === 'explore'
    ? (data?.totalElements ?? 0)
    : tab === 'trending'
      ? (trendingData?.totalElements ?? 0)
      : (mostSavedData?.totalElements ?? 0);

  const isFirstPage = Boolean(
    tab === 'explore'
      ? (data ? (data.isFirst ?? currentPage <= 0) : true)
      : tab === 'trending'
        ? (trendingData ? (trendingData.isFirst ?? currentPage <= 0) : true)
        : (mostSavedData ? (mostSavedData.isFirst ?? currentPage <= 0) : true)
  );

  const isLastPage = Boolean(
    tab === 'explore'
      ? (data ? (data.isLast ?? (totalPages === 0 || currentPage >= totalPages - 1)) : true)
      : tab === 'trending'
        ? (trendingData ? (trendingData.isLast ?? (totalPages === 0 || currentPage >= totalPages - 1)) : true)
        : (mostSavedData ? (mostSavedData.isLast ?? (totalPages === 0 || currentPage >= totalPages - 1)) : true)
  );

  const activeTabError = tab === 'explore'
    ? exploreError
    : tab === 'trending'
      ? trendingError
      : mostSavedError;

  const activeTabLoading = tab === 'explore'
    ? data === null
    : tab === 'trending'
      ? trendingData === null
      : mostSavedData === null;

  const hasActiveFilters = Boolean(
    committedQ || tagFilter || windowFilter !== 'all' || sortFilter !== 'newest' || selectedLanguage !== 'all'
  );

  const goPrev = () => {
    if (tab === 'explore') setPage(Math.max(0, currentPage - 1));
    else if (tab === 'trending') setTrendingPage(Math.max(0, currentPage - 1));
    else setMostSavedPage(Math.max(0, currentPage - 1));
  };
  const goNext = () => {
    if (tab === 'explore') setPage(Math.min(Math.max(totalPages - 1, 0), currentPage + 1));
    else if (tab === 'trending') setTrendingPage(Math.min(Math.max(totalPages - 1, 0), currentPage + 1));
    else setMostSavedPage(Math.min(Math.max(totalPages - 1, 0), currentPage + 1));
  };

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
            onSelectTag={handleTagToggle}
            fromTab={tab}
          />
        );
      })}
    </div>
  );

  return (
    <div className="workspace discovery-page">
      <header className="discovery-header">
        <div>
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
          </nav>
        </div>
      </header>

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
            </div>
            <button type="submit" className="discovery-search__submit">
              Search
            </button>
          </form>
        )}

        <div className="discovery-filters">
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
                onChange={(val) => {
                  setTrendingPage(0);
                  setTrendingWindow(val as '24h' | '7d' | '30d');
                }}
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

      {tab === 'explore' && exploreError && data !== null && (
        <div className="discovery-alert" role="alert">
          <span>Couldn&apos;t refresh results. Showing the last loaded snippets.</span>
          <button
            type="button"
            className="discovery-alert__retry"
            onClick={() => setExploreTick((t) => t + 1)}
          >
            <Icon name="refresh" size={13} />
            <span>Retry</span>
          </button>
        </div>
      )}

      <div className="discovery-results">
        <h2 className="discovery-results__title">
          {tab === 'explore' ? 'Latest public pastes' : tab === 'trending' ? 'Trending pastes' : 'Most saved'}
        </h2>
        {!activeTabLoading && (
          <span className="discovery-results__count">{pluralizeCount(totalElements)}</span>
        )}
      </div>

      {tab === 'explore' && isFetching && data !== null && (
        <div className="discovery-status" role="status">
          <span className="discovery-status__dot" aria-hidden="true" />
          <span>Updating results…</span>
        </div>
      )}
      {tab === 'trending' && trendingLoading && trendingData !== null && (
        <div className="discovery-status" role="status">
          <span className="discovery-status__dot" aria-hidden="true" />
          <span>Updating results…</span>
        </div>
      )}
      {tab === 'most-saved' && mostSavedLoading && mostSavedData !== null && (
        <div className="discovery-status" role="status">
          <span className="discovery-status__dot" aria-hidden="true" />
          <span>Updating results…</span>
        </div>
      )}

      {tab === 'explore' ? (
        exploreError && data === null ? (
          <section className="discovery-state" aria-label="Failed to connect to registry">
            <div className="discovery-state__icon" aria-hidden="true">
              <Icon name="alert" size={24} />
            </div>
            <h3 className="discovery-state__title">Failed to connect to registry</h3>
            <p className="discovery-state__body">
              {exploreError}
            </p>
            <button
              type="button"
              className="discovery-state__action"
              onClick={() => setExploreTick((t) => t + 1)}
            >
              <Icon name="refresh" size={14} />
              <span>Retry Connection</span>
            </button>
          </section>
        ) : data === null ? (
          <Loading
            variant="card"
            message="Fetching snippets from public registry..."
            className="min-h-[400px]"
          />
        ) : items.length === 0 ? (
          <section className="discovery-empty" role="region" aria-labelledby="discovery-empty-heading">
            <div className="discovery-empty__icon" aria-hidden="true">
              <Icon name="file" size={26} />
            </div>
            <h3 id="discovery-empty-heading" className="discovery-empty__title">
              No public pastes found
            </h3>
            <p className="discovery-empty__body">
              {hasActiveFilters
                ? 'No eligible public snippets match these filters. Try clearing them or a different search.'
                : 'Be the first to publish a public snippet to the community registry.'}
            </p>
            {hasActiveFilters && (
              <button type="button" className="discovery-empty__action" onClick={handleClearFilters}>
                <Icon name="refresh" size={14} />
                <span>Clear filters</span>
              </button>
            )}
          </section>
        ) : (
          renderGrid(isFetching)
        )
      ) : tab === 'trending' ? (
        trendingError && trendingData === null ? (
          <section className="discovery-state" aria-label="Could not load trending snippets">
            <div className="discovery-state__icon" aria-hidden="true">
              <Icon name="alert" size={24} />
            </div>
            <h3 className="discovery-state__title">Could not load trending snippets</h3>
            <p className="discovery-state__body">Please try again in a moment.</p>
            <button
              type="button"
              className="discovery-state__action"
              onClick={() => setTrendingTick((t) => t + 1)}
            >
              <Icon name="refresh" size={14} />
              <span>Retry</span>
            </button>
          </section>
        ) : trendingData === null ? (
          <Loading variant="card" message="Calculating trending momentum..." className="min-h-[400px]" />
        ) : items.length === 0 ? (
          <section className="discovery-empty" role="region" aria-labelledby="discovery-trending-empty">
            <div className="discovery-empty__icon" aria-hidden="true">
              <Icon name="file" size={26} />
            </div>
            <h3 id="discovery-trending-empty" className="discovery-empty__title">
              No trending snippets yet
            </h3>
            <p className="discovery-empty__body">
              Pastes with recent views and saves will appear here.
            </p>
          </section>
        ) : (
          renderGrid(trendingLoading)
        )
      ) : mostSavedError && mostSavedData === null ? (
        <section className="discovery-state" aria-label="Could not load most-saved snippets">
          <div className="discovery-state__icon" aria-hidden="true">
            <Icon name="alert" size={24} />
          </div>
          <h3 className="discovery-state__title">Could not load most-saved snippets</h3>
          <p className="discovery-state__body">Please try again in a moment.</p>
          <button
            type="button"
            className="discovery-state__action"
            onClick={() => setMostSavedTick((t) => t + 1)}
          >
            <Icon name="refresh" size={14} />
            <span>Retry</span>
          </button>
        </section>
      ) : mostSavedData === null ? (
        <Loading variant="card" message="Loading most-saved snippets..." className="min-h-[400px]" />
      ) : items.length === 0 ? (
        <section className="discovery-empty" role="region" aria-labelledby="discovery-most-saved-empty">
          <div className="discovery-empty__icon" aria-hidden="true">
            <Icon name="file" size={26} />
          </div>
          <h3 id="discovery-most-saved-empty" className="discovery-empty__title">
            No saved snippets yet
          </h3>
          <p className="discovery-empty__body">
            Use the Save button on a public snippet to add it here.
          </p>
        </section>
      ) : (
        renderGrid(mostSavedLoading)
      )}

      {!activeTabError && !activeTabLoading && totalPages > 1 && (
        <div className="discovery-pagination">
          <span>
            Page {currentPage + 1} of {totalPages} &middot; {totalElements} snippets
          </span>
          <div className="discovery-pagination__controls">
            <button
              type="button"
              className="discovery-pagination__btn"
              onClick={goPrev}
              disabled={isFirstPage}
            >
              Previous
            </button>
            <button
              type="button"
              className="discovery-pagination__btn"
              onClick={goNext}
              disabled={isLastPage}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscoveryPage;
