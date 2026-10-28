import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DiscoveryCard } from '../../discovery/components/DiscoveryCard';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { ProfileSocialLinks } from '../../../components/ui/ProfileSocialLinks';
import { ProfilePageSkeleton, PasteGridSkeleton } from '../../../components/ui/SkeletonLayouts';
import { Select } from '../../../components/ui/dropdown';
import { Icon } from '../../../components/ui/PaperIcon';
import { ApiError } from '../../../lib/api-client/client';
import { useAuth } from '../../auth/context/AuthContext';
import { authorProfileApi } from '../api/authorProfileApi';
import type { PublicAuthorProfile } from '../api/authorProfileApi';
import type { PagedResponse, PasteSummary } from '../../dashboard/api/accountApi';
import { FollowButton } from '../components/FollowButton';
import '../authors.css';
import '../author-network.css';
import '../../discovery/discovery.css';

const PAGE_SIZE = 18;

type ProfileStatus = 'loading' | 'success' | 'error' | 'notfound';
type WorkStatus = 'loading' | 'success' | 'error';

const plural = (count: number, singular: string, pluralLabel: string) =>
  `${count.toLocaleString()} ${count === 1 ? singular : pluralLabel}`;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'views', label: 'Most viewed' },
  { value: 'stars', label: 'Most saved / starred' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title (A–Z)' },
];

const formatJoined = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `Member since ${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
};

/**
 * Level 2 — Full writer profile page & developer knowledge discovery.
 *
 * Implements:
 * A. Author identity (Avatar, handle, member since date, writer role)
 * B. Contribution statistics (Public pastes, total views, total stars/saves, distinct languages count)
 * C. Content discovery (Search writer pastes, language filter tabs, sort dropdown, pagination, responsive discovery grid)
 */
export const PublicAuthorProfilePage: React.FC = () => {
  const { username = '' } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const [followed, setFollowed] = useState(false);

  const rawPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const displayPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const page = displayPage - 1;

  const currentQ = searchParams.get('q') || '';
  const currentLang = searchParams.get('language') || 'all';
  const currentSort = searchParams.get('sort') || 'newest';

  const [searchInput, setSearchInput] = useState(currentQ);
  const [profile, setProfile] = useState<PublicAuthorProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');
  const [profileReload, setProfileReload] = useState(0);

  const [work, setWork] = useState<PagedResponse<PasteSummary> | null>(null);
  const [workStatus, setWorkStatus] = useState<WorkStatus>('loading');
  const [workReload, setWorkReload] = useState(0);

  // Sync search input if URL changes
  useEffect(() => {
    setSearchInput(currentQ);
  }, [currentQ]);

  // Load public profile metadata
  useEffect(() => {
    const controller = new AbortController();
    setProfileStatus('loading');
    setProfile(null);

    authorProfileApi
      .getAuthorProfile(username, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setProfile(data);
        setFollowed(Boolean(data.followedByViewer));
        setProfileStatus('success');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 400)) {
          setProfileStatus('notfound');
        } else {
          setProfileStatus('error');
        }
      });

    return () => controller.abort();
  }, [username, profileReload]);

  // Load public pastes matching current filters
  useEffect(() => {
    const controller = new AbortController();
    setWorkStatus('loading');

    authorProfileApi
      .getAuthorPastes(
        username,
        page,
        PAGE_SIZE,
        {
          q: currentQ || undefined,
          language: currentLang === 'all' ? undefined : currentLang,
          sort: currentSort,
        },
        controller.signal
      )
      .then((data) => {
        if (controller.signal.aborted) return;
        setWork(data);
        setWorkStatus('success');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 400)) {
          setProfileStatus('notfound');
        } else {
          setWorkStatus('error');
        }
      });

    return () => controller.abort();
  }, [username, page, currentQ, currentLang, currentSort, workReload]);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [page]);

  const updateFilters = (updates: Partial<{ page: number; q: string; language: string; sort: string }>) => {
    const next = new URLSearchParams(searchParams);

    if (updates.page !== undefined) {
      if (updates.page <= 1) next.delete('page');
      else next.set('page', String(updates.page));
    }

    if (updates.q !== undefined) {
      if (!updates.q) next.delete('q');
      else next.set('q', updates.q);
      next.delete('page');
    }

    if (updates.language !== undefined) {
      if (!updates.language || updates.language === 'all') next.delete('language');
      else next.set('language', updates.language);
      next.delete('page');
    }

    if (updates.sort !== undefined) {
      if (!updates.sort || updates.sort === 'newest') next.delete('sort');
      else next.set('sort', updates.sort);
      next.delete('page');
    }

    setSearchParams(next);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: searchInput.trim() });
  };

  const clearAllFilters = () => {
    setSearchInput('');
    const next = new URLSearchParams();
    setSearchParams(next);
  };

  if (profileStatus === 'loading') {
    return <ProfilePageSkeleton />;
  }

  if (profileStatus === 'notfound') {
    return (
      <div className="workspace author-profile">
        <div className="author-profile__state">
          <h1 className="author-profile__state-title">Profile not found</h1>
          <p>This author doesn&apos;t exist or is no longer available.</p>
          <Link to="/discovery" className="author-profile__back-link">
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  if (profileStatus === 'error' || !profile) {
    return (
      <div className="workspace author-profile">
        <div className="author-profile__state">
          <h1 className="author-profile__state-title">Couldn&apos;t load this profile</h1>
          <p>Please try again in a moment.</p>
          <button
            type="button"
            className="author-profile__retry"
            onClick={() => setProfileReload((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalPages = work?.totalPages ?? 0;
  const distinctLanguagesCount = profile.languagesCount ?? (profile.topLanguages?.length || 0);
  const isFiltered = Boolean(currentQ || (currentLang && currentLang !== 'all') || currentSort !== 'newest');
  const displayName = profile.displayName?.trim() || '';
  const bio = profile.bio?.trim() || '';

  return (
    <div className="workspace author-profile">
      <Link to="/discovery" className="author-profile__back-link">
        ← Back to Explore
      </Link>

      {/* A. Author Identity Header */}
      <header className="author-profile__header">
        <div className="author-profile__hero">
          <div className="author-profile__avatar-stack">
            <span className="author-profile__avatar-halo" aria-hidden="true" />
            <UserAvatar
              username={profile.username}
              avatarUrl={profile.avatarUrl}
              size={96}
              alt={`@${profile.username}`}
              className="author-profile__avatar"
            />
            <span className="author-profile__avatar-mark" aria-hidden="true">@</span>
          </div>

          <div className="author-profile__identity">
            <p className="author-profile__eyebrow">
              <span className="author-profile__eyebrow-dot" aria-hidden="true" />
              Public profile
            </p>

            <div className="author-profile__title-row">
              <h1 className="author-profile__title">
                {displayName || `@${profile.username}`}
              </h1>
              <span className="author-profile__writer-badge">Writer</span>
            </div>

            {displayName && <p className="author-profile__handle">@{profile.username}</p>}

            <div className="author-profile__relationship-inline">
              <Link to={`/users/${encodeURIComponent(profile.username)}/followers`} className="author-profile__relationship-link">
                {(profile.followerCount ?? 0).toLocaleString()} followers
              </Link>
              <span className="author-profile__relationship-sep" aria-hidden="true">·</span>
              <Link to={`/users/${encodeURIComponent(profile.username)}/following`} className="author-profile__relationship-link">
                {(profile.followingCount ?? 0).toLocaleString()} following
              </Link>
            </div>

            <p className={`author-profile__bio${bio ? '' : ' author-profile__bio--empty'}`}>
              {bio || 'No bio yet — this writer lets the code do the talking.'}
            </p>

            <div className="author-profile__meta-row">
              <p className="author-profile__joined">
                <Icon name="clock" size={12} />
                <span>{formatJoined(profile.joinedAt)}</span>
              </p>
              <ProfileSocialLinks
                githubUrl={profile.githubUrl}
                linkedinUrl={profile.linkedinUrl}
                xUrl={profile.xUrl}
              />
            </div>

            <div className="author-profile__follow-controls">
              <FollowButton username={profile.username} followed={followed} authenticated={isAuthenticated}
                self={user?.username === profile.username} onChange={(value) => {
                  setFollowed(value);
                  setProfile((current) => current ? { ...current, followedByViewer: value,
                    followerCount: Math.max(0, (current.followerCount ?? 0) + (value ? 1 : -1)) } : current);
                }} />
              {user?.username === profile.username && <Link to="/following" className="author-profile__relationship-count">Following feed</Link>}
            </div>
          </div>
        </div>

        {/* B. Contribution Statistics (Meaningful metrics only) */}
        <div className="author-profile__stats-grid" aria-label="Author contribution statistics">
          <div className="author-profile__stat-card author-profile__stat-card--coral">
            <span className="author-profile__stat-icon" aria-hidden="true">
              <Icon name="file" size={15} />
            </span>
            <div className="author-profile__stat-body">
              <span className="author-profile__stat-label">
                <span className="sr-only">{plural(profile.publicPasteCount, 'public paste', 'public pastes')}</span>
                <span aria-hidden="true">Public pastes</span>
              </span>
              <span className="author-profile__stat-val">
                {profile.publicPasteCount.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="author-profile__stat-card author-profile__stat-card--blue">
            <span className="author-profile__stat-icon" aria-hidden="true">
              <Icon name="eye" size={15} />
            </span>
            <div className="author-profile__stat-body">
              <span className="author-profile__stat-label">
                <span className="sr-only">{plural(profile.totalViews, 'view', 'views')}</span>
                <span aria-hidden="true">Total views</span>
              </span>
              <span className="author-profile__stat-val">
                {profile.totalViews.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="author-profile__stat-card author-profile__stat-card--acid">
            <span className="author-profile__stat-icon" aria-hidden="true">
              <Icon name="spark" size={15} />
            </span>
            <div className="author-profile__stat-body">
              <span className="author-profile__stat-label">
                <span className="sr-only">{plural(profile.totalSaves, 'save', 'saves')}</span>
                <span aria-hidden="true">Total stars</span>
              </span>
              <span className="author-profile__stat-val">
                {profile.totalSaves.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="author-profile__stat-card author-profile__stat-card--ink">
            <span className="author-profile__stat-icon" aria-hidden="true">
              <Icon name="code" size={15} />
            </span>
            <div className="author-profile__stat-body">
              <span className="author-profile__stat-label">Languages</span>
              <span className="author-profile__stat-val">
                {distinctLanguagesCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* C. Content Discovery Section */}
      <section className="author-profile__work" aria-labelledby="public-work-heading">
        <div className="author-profile__section-head">
          <div className="author-profile__section-title-wrap">
            <h2 id="public-work-heading" className="author-profile__section-title" aria-label="Explore their work - Public work">
              Explore their work
            </h2>
          </div>
          <span className="author-profile__section-count">
            {work ? `${work.totalElements.toLocaleString()} notes found` : `${profile.publicPasteCount.toLocaleString()} total`}
          </span>
        </div>

        {/* Discovery Search & Filter Toolbar */}
        <div className="author-profile__discovery-bar">
          {/* Quick Language Tabs */}
          <div className="author-profile__quick-topics" role="tablist" aria-label="Language filter tabs">
            <button
              type="button"
              className={`author-profile__topic-pill${currentLang === 'all' ? ' is-active' : ''}`}
              onClick={() => updateFilters({ language: 'all' })}
            >
              All pastes
            </button>
            {profile.topLanguages && profile.topLanguages.map((lang) => (
              <button
                key={lang}
                type="button"
                className={`author-profile__topic-pill${currentLang === lang ? ' is-active' : ''}`}
                onClick={() => updateFilters({ language: currentLang === lang ? 'all' : lang })}
              >
                {lang}
              </button>
            ))}
          </div>

          {/* Search Field & Sort Options */}
          <div className="author-profile__controls-row">
            <form className="author-profile__search-wrap" onSubmit={handleSearchSubmit}>
              <Icon name="search" size={14} className="text-muted" />
              <input
                type="text"
                className="author-profile__search-input"
                placeholder="Search this author's pastes…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search this author's pastes"
              />
              {searchInput && (
                <button
                  type="button"
                  className="author-popover__search-clear"
                  onClick={() => {
                    setSearchInput('');
                    updateFilters({ q: '' });
                  }}
                  aria-label="Clear search input"
                >
                  ×
                </button>
              )}
            </form>

            <div className="author-profile__sort-select">
              <Select
                id="author-profile-sort"
                value={currentSort}
                onChange={(sort) => updateFilters({ sort })}
                options={SORT_OPTIONS}
                size="sm"
                ariaLabel="Sort this author's pastes"
              />
            </div>
          </div>

          {/* Active Filter Tags */}
          {isFiltered && (
            <div className="author-profile__active-filters">
              {currentQ && (
                <span className="author-profile__filter-tag">
                  q: "{currentQ}"
                  <button
                    type="button"
                    onClick={() => updateFilters({ q: '' })}
                    aria-label="Remove search query filter"
                  >
                    ×
                  </button>
                </span>
              )}
              {currentLang !== 'all' && (
                <span className="author-profile__filter-tag">
                  lang: {currentLang}
                  <button
                    type="button"
                    onClick={() => updateFilters({ language: 'all' })}
                    aria-label="Remove language filter"
                  >
                    ×
                  </button>
                </span>
              )}
              {currentSort !== 'newest' && (
                <span className="author-profile__filter-tag">
                  sort: {SORT_OPTIONS.find((s) => s.value === currentSort)?.label}
                  <button
                    type="button"
                    onClick={() => updateFilters({ sort: 'newest' })}
                    aria-label="Remove sort filter"
                  >
                    ×
                  </button>
                </span>
              )}
              <button
                type="button"
                className="author-profile__clear-btn"
                onClick={clearAllFilters}
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Content Listing & Empty/Loading States */}
        {workStatus === 'loading' && !work && (
          <PasteGridSkeleton count={3} label="Loading public work" />
        )}

        {workStatus === 'loading' && work && (
          <div className="discovery-status" role="status">
            <span className="discovery-status__dot" aria-hidden="true" />
            <span>Updating public work…</span>
          </div>
        )}

        {workStatus === 'error' && (
          <div className="author-profile__state">
            <p>Couldn&apos;t load this author&apos;s work.</p>
            <button
              type="button"
              className="author-profile__retry"
              onClick={() => setWorkReload((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {workStatus === 'success' && work && work.items.length === 0 && (
          <div className="author-popover__empty-box">
            <Icon name="file" size={24} className="author-popover__empty-icon" />
            <p className="author-popover__empty">
              {isFiltered ? 'No matching pastes found for these filters.' : 'No public work yet.'}
            </p>
            {isFiltered && (
              <button
                type="button"
                className="author-popover__empty-reset"
                onClick={clearAllFilters}
              >
                Reset all filters
              </button>
            )}
          </div>
        )}

        {work && work.items.length > 0 && (
          <div className={`discovery-grid${workStatus === 'loading' ? ' is-refreshing' : ''}`} aria-busy={workStatus === 'loading'}>
            {work.items.map((item) => (
              <DiscoveryCard
                key={item.id}
                item={item}
                isAuthenticated={isAuthenticated}
                isSaved={false}
                isSaving={false}
                showSaveAction={false}
                showAuthor={false}
              />
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {workStatus === 'success' && work && totalPages > 1 && (
          <nav className="author-profile__pagination" aria-label="Public work pages">
            <button
              type="button"
              className="author-profile__page-button"
              onClick={() => updateFilters({ page: displayPage - 1 })}
              disabled={work.isFirst}
            >
              Previous
            </button>
            <span className="author-profile__page-indicator">
              Page {displayPage} of {totalPages}
            </span>
            <button
              type="button"
              className="author-profile__page-button"
              onClick={() => updateFilters({ page: displayPage + 1 })}
              disabled={work.isLast}
            >
              Next
            </button>
          </nav>
        )}
      </section>
    </div>
  );
};

export default PublicAuthorProfilePage;
