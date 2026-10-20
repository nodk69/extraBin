import React, { useCallback, useRef, useState } from 'react';
import { AuthorProfilePopover } from './AuthorProfilePopover';
import '../authors.css';

export interface AuthorLinkProps {
  /** Public username, or null/undefined when the author cannot be resolved. */
  username?: string | null;
  /**
   * Optional class for the trigger. Defaults to the discovery-card author style so the
   * link can be dropped into the feed without extra CSS.
   */
  className?: string;
}

/**
 * Public author trigger. Renders a real button (keyboard accessible by default) that opens
 * the profile preview without navigating to the paste. Authors that cannot be resolved are
 * shown as plain, non-interactive text rather than a fabricated identity.
 */
export const AuthorLink: React.FC<AuthorLinkProps> = ({
  username,
  className = 'discovery-card__author-name author-link',
}) => {
  const normalized = typeof username === 'string' ? username.trim() : '';
  const triggerRef = useRef<HTMLButtonElement>(null);
  const keyboardIntentRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [focusOnOpen, setFocusOnOpen] = useState(false);

  const openPopover = useCallback(() => {
    setFocusOnOpen(keyboardIntentRef.current);
    keyboardIntentRef.current = false;
    setOpen(true);
  }, []);

  const closePopover = useCallback((restoreFocus = false) => {
    setOpen(false);
    setFocusOnOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  if (!normalized) {
    return <span className="discovery-card__author-name">Author unavailable</span>;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            closePopover(true);
          } else {
            openPopover();
          }
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter' || event.key === ' ') {
            keyboardIntentRef.current = true;
          }
        }}
      >
        by @{normalized}
      </button>

      {open && (
        <AuthorProfilePopover
          username={normalized}
          anchorRef={triggerRef}
          onClose={closePopover}
          focusOnOpen={focusOnOpen}
        />
      )}
    </>
  );
};

export default AuthorLink;
