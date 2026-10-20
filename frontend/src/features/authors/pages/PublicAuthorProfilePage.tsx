import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DiscoveryCard } from '../../discovery/components/DiscoveryCard';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { ApiError } from '../../../lib/api-client/client';
import { useAuth } from '../../auth/context/AuthContext';
import { authorProfileApi } from '../api/authorProfileApi';
import type { PublicAuthorProfile } from '../api/authorProfileApi';
import type { PagedResponse, PasteSummary } from '../../dashboard/api/accountApi';
import '../authors.css';
import '../../discovery/discovery.css';

const PAGE_SIZE = 18;

type ProfileStatus = 'loading' | 'success' | 'error' | 'notfound';
type WorkStatus = 'loading' | 'success' | 'error';

const plural = (count: number, singular: string, pluralLabel: string) =>
  `${count.toLocaleString()} ${count === 1 ? singular : pluralLabel}`;

const formatJoined = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `Joined ${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
};

/**
 * Public author profile.
 *
 * Reads only the public projection (never email/internal id/role). Shows the author's
 * eligible public work with server-side pagination; the page number lives in the URL so
 * refresh, back/forward, and shared links all resolve to the same page.
 */
export const PublicAuthorProfilePage: React.FC = () => {
  const { username = '' } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const rawPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const displayPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const page = displayPage - 1;

  const [profile, setProfile] = useState<PublicAuthorProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');
  const [profileReload, setProfileReload] = useState(0);

  const [work, setWork] = useState<PagedResponse<PasteSummary> | null>(null);
  const [workStatus, setWorkStatus] = useState<WorkStatus>('loading');
  const [workReload, setWorkReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setProfileStatus('loading');
    setProfile(null);

    authorProfileApi
      .getAuthorProfile(username, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setProfile(data);
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

  useEffect(() => {
    const controller = new AbortController();
    setWorkStatus('loading');

    authorProfileApi
      .getAuthorPastes(username, page, PAGE_SIZE, controller.signal)
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
  }, [username, page, workReload]);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [page]);

  const goToPage = (nextPage: number) => {
    const safePage = Math.max(1, nextPage);
    const next = new URLSearchParams(searchParams);
    if (safePage === 1) {
      next.delete('page');
    } else {
      next.set('page', String(safePage));
    }
    setSearchParams(next);
  };

  if (profileStatus === 'loading') {
    return (
      <div className="workspace author-profile">
        <p className="author-profile__state" aria-busy="true">
          Loading profile…
        </p>
      </div>
    );
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

  return (
    <div className="workspace author-profile">
      <Link to="/discovery" className="author-profile__back-link">
        ← Back to Explore
      </Link>

      <header className="author-profile__header">
        <UserAvatar
          username={profile.username}
          size="xl"
          alt={`@${profile.username}`}
          className="author-profile__avatar"
        />
        <div className="author-profile__identity">
          <span className="author-profile__eyebrow">PUBLIC PROFILE</span>
          <h1 className="author-profile__title">@{profile.username}</h1>
          <p className="author-profile__joined">{formatJoined(profile.joinedAt)}</p>
        </div>
        <div className="author-profile__stats">
          <span className="author-profile__stat">
            {plural(profile.publicPasteCount, 'public paste', 'public pastes')}
          </span>
          <span className="author-profile__stat">
            {plural(profile.totalViews, 'view', 'views')}
          </span>
          <span className="author-profile__stat">
            {plural(profile.totalSaves, 'save', 'saves')}
          </span>
        </div>
      </header>

      <section className="author-profile__work" aria-labelledby="public-work-heading">
        <div className="author-profile__section-head">
          <h2 id="public-work-heading" className="author-profile__section-title">
            Public work
          </h2>
          <span className="author-profile__section-count">
            {profile.publicPasteCount.toLocaleString()} total
          </span>
        </div>

        {workStatus === 'loading' && (
          <p className="author-profile__state" aria-busy="true">
            Loading public work…
          </p>
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
          <p className="author-profile__empty">No public work yet.</p>
        )}

        {workStatus === 'success' && work && work.items.length > 0 && (
          <div className="discovery-grid">
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

        {workStatus === 'success' && work && totalPages > 1 && (
          <nav className="author-profile__pagination" aria-label="Public work pages">
            <button
              type="button"
              className="author-profile__page-button"
              onClick={() => goToPage(displayPage - 1)}
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
              onClick={() => goToPage(displayPage + 1)}
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
