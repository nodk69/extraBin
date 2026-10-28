import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { ProfileSocialLinks } from '../../../components/ui/ProfileSocialLinks';
import { Icon } from '../../../components/ui/PaperIcon';
import { AuthorPopoverSkeleton } from '../../../components/ui/SkeletonLayouts';
import { ApiError } from '../../../lib/api-client/client';
import { authorProfileApi } from '../api/authorProfileApi';
import type { PublicAuthorProfile } from '../api/authorProfileApi';
import { useAuth } from '../../auth/context/AuthContext';
import { FollowButton } from './FollowButton';

const MOBILE_QUERY = '(max-width: 640px)';
const POPOVER_WIDTH = 360;
const VIEWPORT_MARGIN = 16;

const plural = (count: number, singular: string, pluralLabel: string) =>
  `${count.toLocaleString()} ${count === 1 ? singular : pluralLabel}`;

const formatJoined = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `Joined ${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
};

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};


const useIsMobileViewport = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(query.matches);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  return isMobile;
};

export interface AuthorProfilePopoverProps {
  username: string;
  anchorRef: React.RefObject<HTMLElement>;
  onClose: (restoreFocus?: boolean) => void;
  focusOnOpen?: boolean;
}

type LoadStatus = 'loading' | 'success' | 'error';

interface Position {
  top: number;
  left: number;
  width: number;
}

/**
 * Level 1 — Compact author preview popup.
 *
 * Designed to be understood in 5–10 seconds:
 * - Avatar, display name, username handle, joined date
 * - Top 2–3 focus languages/topics
 * - Public paste count, total views, total stars
 * - Two popular notes preview
 * - "View full profile" primary CTA to navigate to Level 2
 */
export const AuthorProfilePopover: React.FC<AuthorProfilePopoverProps> = ({
  username,
  anchorRef,
  onClose,
  focusOnOpen = false,
}) => {
  const isMobile = useIsMobileViewport();
  const { user, isAuthenticated } = useAuth();
  const popoverRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [profile, setProfile] = useState<PublicAuthorProfile | null>(null);
  const [followed, setFollowed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

  // Fetch initial profile
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setProfile(null);
    setError(null);

    authorProfileApi
      .getAuthorProfile(username, controller.signal)
      .then((data) => {
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        setProfile(data);
        setFollowed(Boolean(data.followedByViewer));
        setStatus('success');
      })
      .catch((cause: unknown) => {
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        setError(cause);
        setStatus('error');
      });

    return () => controller.abort();
  }, [username, reloadToken]);

  // Escape closes
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Desktop outside-click dismissal
  useEffect(() => {
    if (isMobile) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      // Do not dismiss if clicking inside a dropdown portal
      if ((target as Element).closest?.('.custom-select-menu')) return;
      onClose(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [anchorRef, isMobile, onClose]);

  // Desktop anchoring
  useLayoutEffect(() => {
    if (isMobile) return;
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(POPOVER_WIDTH, Math.max(260, window.innerWidth - VIEWPORT_MARGIN * 2));
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN)
      );
      const height = popoverRef.current?.offsetHeight ?? 0;
      const below = rect.bottom + 8;
      const above = rect.top - height - 8;
      const preferredTop =
        below + height > window.innerHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN
          ? above
          : below;
      const top = Math.max(
        VIEWPORT_MARGIN,
        Math.min(preferredTop, window.innerHeight - height - VIEWPORT_MARGIN)
      );
      setPosition({ top, left, width });
    };

    const observer = popoverRef.current && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(update)
      : null;
    if (popoverRef.current) observer?.observe(popoverRef.current);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, isMobile, status, username]);

  // Focus on open
  useEffect(() => {
    if (isMobile) {
      popoverRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
      return;
    }
    if (focusOnOpen) {
      popoverRef.current?.focus();
    }
  }, [focusOnOpen, isMobile]);

  // Mobile focus trap
  useEffect(() => {
    if (!isMobile) return;
    const node = popoverRef.current;
    if (!node) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile]);

  const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);

  // Active languages from author's recent work
  const activeLanguages = useMemo(() => {
    if (!profile?.recentPastes) return [];
    const langs = new Set<string>();
    for (const p of profile.recentPastes) {
      if (p.language && p.language.trim()) {
        langs.add(p.language.trim());
      }
    }
    return Array.from(langs);
  }, [profile]);

  if (typeof document === 'undefined') return null;

  // Use top languages from backend or fall back to recent work languages
  const topLanguages = profile?.topLanguages && profile.topLanguages.length > 0
    ? profile.topLanguages.slice(0, 3)
    : activeLanguages.slice(0, 3);

  // Show popular notes if provided by backend, or fall back to recent work
  const popularNotes = profile?.popularPastes && profile.popularPastes.length > 0
    ? profile.popularPastes.slice(0, 2)
    : profile?.recentPastes?.slice(0, 2) ?? [];

  const displayName = profile?.displayName?.trim() || '';
  const bio = profile?.bio?.trim() || '';
  const hasSocials = Boolean(profile?.githubUrl || profile?.linkedinUrl || profile?.xUrl);

  const content = (
    <>
      {isMobile && (
        <div
          className="author-popover__backdrop"
          aria-hidden="true"
          onPointerDown={() => onClose(true)}
        />
      )}
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal={isMobile ? 'true' : undefined}
        aria-label={`Profile preview for ${username}`}
        className={`author-popover${isMobile ? ' author-popover--sheet' : ''}`}
        style={
          isMobile
            ? undefined
            : position
            ? { top: position.top, left: position.left, width: position.width }
            : { visibility: 'hidden' }
        }
        tabIndex={-1}
        data-testid="author-popover"
      >
        {isMobile && <div className="author-popover__drag-handle" aria-hidden="true" />}

        <button
          type="button"
          className="author-popover__close"
          aria-label="Close profile preview"
          data-autofocus
          onClick={() => onClose(true)}
        >
          <span aria-hidden="true">×</span>
        </button>

        {status === 'loading' && <AuthorPopoverSkeleton />}

        {status === 'error' && (
          <div className="author-popover__state author-popover__state--error">
            <div className="author-popover__error-icon" aria-hidden="true">
              <Icon name="alert" size={18} />
            </div>
            <p className="author-popover__error-title">
              {notFound ? 'This author is no longer available.' : "Couldn't load this profile."}
            </p>
            <p className="author-popover__error-sub">
              {notFound
                ? 'The user account may have been renamed or removed.'
                : 'Check your connection and try again.'}
            </p>
            {!notFound && (
              <button
                type="button"
                className="author-popover__retry"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                <Icon name="refresh" size={13} />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {status === 'success' && profile && (
          <>
            {/* 1. Header: Avatar, Identity, Joined Date, and Follow Action */}
            <div className="author-popover__header">
              <div className="author-popover__avatar-wrap">
                <UserAvatar username={profile.username} avatarUrl={profile.avatarUrl} size="lg" alt={`@${profile.username}`} />
              </div>
              <div className="author-popover__identity">
                <div className="author-popover__name-badge">
                  <span className="author-popover__display-name" title={displayName || profile.username}>
                    {displayName || profile.username}
                  </span>
                </div>
                <p className="author-popover__username" title={`@${profile.username}`}>
                  @{profile.username}
                </p>
                {formatJoined(profile.joinedAt) && (
                  <p className="author-popover__joined">
                    <Icon name="clock" size={11} className="author-popover__meta-icon" />
                    <span>{formatJoined(profile.joinedAt)}</span>
                  </p>
                )}
              </div>
              <div className="author-popover__follow-action">
                <FollowButton
                  username={profile.username}
                  followed={followed}
                  authenticated={isAuthenticated}
                  self={user?.username === profile.username}
                  compact
                  onChange={(value) => {
                    setFollowed(value);
                    setProfile((current) =>
                      current
                        ? {
                            ...current,
                            followedByViewer: value,
                            followerCount: Math.max(0, (current.followerCount ?? 0) + (value ? 1 : -1)),
                          }
                        : current
                    );
                  }}
                />
              </div>
            </div>

            {(bio || hasSocials) && (
              <div className="author-popover__about">
                {bio && <p className="author-popover__bio">{bio}</p>}
                {hasSocials && (
                  <ProfileSocialLinks
                    githubUrl={profile.githubUrl}
                    linkedinUrl={profile.linkedinUrl}
                    xUrl={profile.xUrl}
                    variant="compact"
                    className="author-popover__socials"
                  />
                )}
              </div>
            )}

            <div className="author-popover__stats" aria-label="Author contribution stats">
              <Link
                to={`/users/${encodeURIComponent(profile.username)}/followers`}
                className="author-popover__stat author-popover__stat--link"
                onClick={() => onClose(false)}
                title="View followers"
              >
                {plural(profile.followerCount ?? 0, 'follower', 'followers')}
              </Link>
              <span className="author-popover__stat">
                {plural(profile.publicPasteCount, 'public paste', 'public pastes')}
              </span>
              <span className="author-popover__stat">
                {plural(profile.totalViews, 'view', 'views')}
              </span>
              <span className="author-popover__stat">
                {plural(profile.totalSaves, 'save', 'saves')}
              </span>
            </div>
            {topLanguages.length > 0 && (
              <div className="author-popover__topics" aria-label="Author focus languages">
                {topLanguages.slice(0, 2).map((lang) => (
                  <span key={lang} className="author-popover__topic-tag">
                    {lang}
                  </span>
                ))}
              </div>
            )}

            {/* Two recent public pastes keep the preview compact. */}
            <div className="author-popover__work">
              <div className="author-popover__section-head">
                <p className="author-popover__section-label">Recent public pastes</p>
                <span className="author-popover__section-sub">Preview</span>
              </div>

              {popularNotes.length === 0 ? (
                <div className="author-popover__empty-box">
                  <Icon name="file" size={18} className="author-popover__empty-icon" />
                  <p className="author-popover__empty">No public work yet.</p>
                </div>
              ) : (
                <ul className="author-popover__recent">
                  {popularNotes.slice(0, 2).map((paste) => (
                    <li key={paste.id}>
                      <Link
                        to={`/p/${encodeURIComponent(paste.id)}`}
                        className="author-popover__recent-link"
                        onClick={() => onClose(false)}
                      >
                        <div className="author-popover__recent-top">
                          <span className="author-popover__recent-title" title={paste.title || 'Untitled Snippet'}>
                            {paste.title?.trim() || 'Untitled Snippet'}
                          </span>
                          <span className="author-popover__recent-arrow" aria-hidden="true">
                            <Icon name="arrow" size={12} />
                          </span>
                        </div>
                        <div className="author-popover__recent-meta">
                          {paste.language && (
                            <span className="author-popover__meta-lang">{paste.language}</span>
                          )}
                          {paste.contentSizeBytes > 0 && (
                            <span className="author-popover__meta-size">
                              {formatBytes(paste.contentSizeBytes)}
                            </span>
                          )}
                          {typeof paste.views === 'number' && (
                            <span className="author-popover__meta-views">
                              {paste.views.toLocaleString()} view{paste.views === 1 ? '' : 's'}
                            </span>
                          )}
                          {typeof paste.starsCount === 'number' && (
                            <span className="author-popover__meta-stars">
                              ★ {paste.starsCount}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Primary action to the complete public profile. */}
            <div className="author-popover__footer">
              <Link
                to={`/users/${encodeURIComponent(profile.username)}`}
                className="author-popover__cta"
                aria-label={`View Profile for @${profile.username}`}
                onClick={() => onClose(false)}
              >
                <span>View Profile</span>
                <Icon name="arrow" size={14} />
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );

  return createPortal(content, document.body);
};

export default AuthorProfilePopover;
