import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { ApiError } from '../../../lib/api-client/client';
import { authorProfileApi } from '../api/authorProfileApi';
import type { PublicAuthorProfile } from '../api/authorProfileApi';
import type { PasteSummary } from '../../dashboard/api/accountApi';

const MOBILE_QUERY = '(max-width: 640px)';
const POPOVER_WIDTH = 340;
const VIEWPORT_MARGIN = 12;

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

const plural = (count: number, singular: string, pluralLabel: string) =>
  `${count.toLocaleString()} ${count === 1 ? singular : pluralLabel}`;

const formatJoined = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `Joined ${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
};

const formatPublished = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

/**
 * Compact developer identity card. Desktop: anchored, non-modal popover rendered through a
 * portal (the snippet card clips overflow). Mobile: bottom sheet dialog with a focus trap.
 * Fetches only when opened, aborts on close/author change, and ignores stale responses.
 */
export const AuthorProfilePopover: React.FC<AuthorProfilePopoverProps> = ({
  username,
  anchorRef,
  onClose,
  focusOnOpen = false,
}) => {
  const isMobile = useIsMobileViewport();
  const popoverRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [profile, setProfile] = useState<PublicAuthorProfile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

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
        setStatus('success');
      })
      .catch((cause: unknown) => {
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        setError(cause);
        setStatus('error');
      });

    return () => controller.abort();
  }, [username, reloadToken]);

  // Escape closes; the trigger restores focus when the close came from inside the dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Desktop outside-click dismissal. The mobile backdrop handles this separately.
  useEffect(() => {
    if (isMobile) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [anchorRef, isMobile, onClose]);

  // Desktop anchoring: fixed coordinates derived from the trigger rect, clamped to the viewport.
  useLayoutEffect(() => {
    if (isMobile) return;
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(POPOVER_WIDTH, Math.max(240, window.innerWidth - VIEWPORT_MARGIN * 2));
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN)
      );
      const height = popoverRef.current?.offsetHeight ?? 340;
      const below = rect.bottom + 8;
      const above = rect.top - height - 8;
      const top = below + height > window.innerHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN
        ? above
        : below;
      setPosition({ top, left, width });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, isMobile, status, username]);

  // Move focus only when the interaction was keyboard-initiated (desktop) or modal (mobile).
  useEffect(() => {
    if (isMobile) {
      popoverRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
      return;
    }
    if (focusOnOpen) {
      popoverRef.current?.focus();
    }
  }, [focusOnOpen, isMobile]);

  // Mobile only: trap Tab inside the sheet and lock background scrolling.
  useEffect(() => {
    if (!isMobile) return;
    const node = popoverRef.current;
    if (!node) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  if (typeof document === 'undefined') return null;

  const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
  const recentPastes: PasteSummary[] = profile?.recentPastes?.slice(0, 3) ?? [];

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
        style={isMobile ? undefined : position ? { top: position.top, left: position.left, width: position.width } : { visibility: 'hidden' }}
        tabIndex={-1}
        data-testid="author-popover"
      >
        <button
          type="button"
          className="author-popover__close"
          aria-label="Close profile preview"
          data-autofocus
          onClick={() => onClose(true)}
        >
          ×
        </button>

        {status === 'loading' && (
          <p className="author-popover__state" aria-busy="true">
            Loading profile…
          </p>
        )}

        {status === 'error' && (
          <div className="author-popover__state">
            <p>{notFound ? 'This author is no longer available.' : "Couldn't load this profile."}</p>
            {!notFound && (
              <button
                type="button"
                className="author-popover__retry"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {status === 'success' && profile && (
          <>
            <div className="author-popover__header">
              <UserAvatar username={profile.username} size="lg" alt={`@${profile.username}`} />
              <div className="author-popover__identity">
                <p className="author-popover__username">@{profile.username}</p>
                <p className="author-popover__joined">{formatJoined(profile.joinedAt)}</p>
              </div>
            </div>

            <div className="author-popover__stats">
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

            <div className="author-popover__work">
              <p className="author-popover__section-label">Recent public work</p>
              {recentPastes.length === 0 ? (
                <p className="author-popover__empty">No public work yet.</p>
              ) : (
                <ul className="author-popover__recent">
                  {recentPastes.map((paste) => (
                    <li key={paste.id}>
                      <Link
                        to={`/p/${encodeURIComponent(paste.id)}`}
                        className="author-popover__recent-link"
                        onClick={() => onClose(false)}
                      >
                        <span className="author-popover__recent-title">
                          {paste.title?.trim() || 'Untitled Snippet'}
                        </span>
                        <span className="author-popover__recent-meta">
                          {[paste.language, formatPublished(paste.createdAt)].filter(Boolean).join(' · ')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Link
              to={`/users/${encodeURIComponent(profile.username)}`}
              className="author-popover__cta"
              onClick={() => onClose(false)}
            >
              View full profile
            </Link>
          </>
        )}
      </div>
    </>
  );

  return createPortal(content, document.body);
};

export default AuthorProfilePopover;
