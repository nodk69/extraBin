import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/PaperIcon';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { UserResponse } from '../types/auth';

interface UserDropdownProps {
  user: UserResponse;
  onLogout: () => Promise<void>;
}

export const UserDropdown: React.FC<UserDropdownProps> = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close menu and restore focus to trigger button
  const closeMenu = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    setLogoutError(null);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  // Single pointerdown listener avoids mobile touchstart + mousedown double-fire
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeMenu(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen, closeMenu]);

  // Keyboard navigation & accessibility (Escape, ArrowDown, ArrowUp, Home, End)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(true);
        return;
      }

      if (!menuRef.current) return;
      const focusable = menuRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])'
      );
      if (!focusable.length) return;

      const items = Array.from(focusable);
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[nextIndex].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prevIndex].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeMenu]);

  // Focus the first interactive element when dropdown opens
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const firstFocusable = menuRef.current.querySelector<HTMLElement>(
        'a[href], button:not([disabled])'
      );
      firstFocusable?.focus();
    }
  }, [isOpen]);

  const handleLogoutClick = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      await onLogout();
      closeMenu(false);
      navigate('/');
    } catch (err) {
      console.error('Logout failed:', err);
      setLogoutError('Failed to sign out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, onLogout, closeMenu, navigate]);

  const displayName = useMemo(
    () => user.username || user.email?.split('@')[0] || 'User',
    [user.username, user.email]
  );

  const roleLabel = useMemo(() => {
    if (!user.role) return 'USER';
    const cleanRole = user.role.replace(/^ROLE_/, '');
    switch (cleanRole) {
      case 'ADMIN':
        return 'ADMIN';
      case 'MODERATOR':
        return 'MOD';
      case 'USER':
        return 'DEV';
      default:
        return cleanRole;
    }
  }, [user.role]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        id="user-menu-trigger"
        aria-controls="user-account-menu"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="User account menu"
        disabled={isLoggingOut}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-[#17201d] bg-white hover:bg-[#ebe7dc] text-[#17201d] transition-all duration-150 select-none shadow-[2px_2px_0px_#17201d] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#17201d] disabled:opacity-60 disabled:cursor-not-allowed ${
          isOpen ? 'bg-[#ebe7dc] ring-2 ring-[#d1f04b]' : ''
        }`}
      >
        <UserAvatar user={user} size="sm" showStatus={true} />

        <span className="font-mono text-xs font-bold tracking-tight max-w-[110px] truncate hidden sm:inline text-[#17201d]">
          {displayName}
        </span>

        <span
          className={`text-[#74786f] group-hover:text-[#17201d] transition-transform duration-200 ${
            isOpen ? 'rotate-180' : 'rotate-0'
          }`}
          aria-hidden="true"
        >
          <Icon name="chevron-down" size={13} />
        </span>
      </button>

      {/* Dropdown Menu Card */}
      {isOpen && (
        <div
          ref={menuRef}
          id="user-account-menu"
          aria-labelledby="user-menu-trigger"
          className="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto bg-[#fcfbf7] border-2 border-[#17201d] rounded-xl shadow-[4px_4px_0px_#17201d] z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Identity Header */}
          <div className="px-4 py-3 bg-[#ebe7dc]/70 border-b border-[#d8d4ca] flex items-center gap-3">
            <UserAvatar user={user} size="lg" showStatus={true} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-mono font-bold text-sm text-[#17201d] truncate">
                  {displayName}
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#17201d] text-[#d1f04b] uppercase shrink-0">
                  {roleLabel}
                </span>
              </div>
              <p
                className="text-xs font-mono text-[#74786f] truncate m-0"
                title={user.email}
              >
                {user.email}
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="py-1" aria-label="User navigation links">
            <Link
              to="/account"
              onClick={() => closeMenu(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] focus:bg-[#ebe7dc] focus:outline-none transition-colors no-underline group"
            >
              <span className="p-1 rounded bg-[#ebe7dc] text-[#17201d] group-hover:bg-[#17201d] group-hover:text-[#d1f04b] transition-colors">
                <Icon name="user" size={13} />
              </span>
              <span>Account &amp; Pastes</span>
            </Link>

            <Link
              to="/settings"
              onClick={() => closeMenu(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] focus:bg-[#ebe7dc] focus:outline-none transition-colors no-underline group"
            >
              <span className="p-1 rounded bg-[#ebe7dc] text-[#17201d] group-hover:bg-[#17201d] group-hover:text-[#d1f04b] transition-colors">
                <Icon name="settings" size={13} />
              </span>
              <span>Settings</span>
            </Link>

            <Link
              to="/"
              onClick={() => closeMenu(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] focus:bg-[#ebe7dc] focus:outline-none transition-colors no-underline group"
            >
              <span className="p-1 rounded bg-[#ebe7dc] text-[#17201d] group-hover:bg-[#17201d] group-hover:text-[#d1f04b] transition-colors">
                <Icon name="plus" size={13} />
              </span>
              <span>New Paste</span>
            </Link>

            <Link
              to="/discovery"
              onClick={() => closeMenu(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] focus:bg-[#ebe7dc] focus:outline-none transition-colors no-underline group"
            >
              <span className="p-1 rounded bg-[#ebe7dc] text-[#17201d] group-hover:bg-[#17201d] group-hover:text-[#d1f04b] transition-colors">
                <Icon name="spark" size={13} />
              </span>
              <span>Explore Discovery</span>
            </Link>
          </nav>

          {/* Error Banner (if logout fails) */}
          {logoutError && (
            <div className="px-3 py-1.5 mx-2 my-1 bg-red-100 border border-red-300 rounded text-red-700 text-[11px] font-mono flex items-center justify-between">
              <span>{logoutError}</span>
              <button
                type="button"
                onClick={() => setLogoutError(null)}
                className="text-red-500 hover:text-red-800 font-bold ml-1"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {/* Logout Action */}
          <div className="p-1.5 border-t border-[#d8d4ca] bg-[#fcfbf7]">
            <button
              type="button"
              onClick={handleLogoutClick}
              disabled={isLoggingOut}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-red-600 rounded-lg hover:bg-red-50 focus:bg-red-50 focus:outline-none hover:text-red-700 transition-colors border border-transparent hover:border-red-200 disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <Icon name="log-out" size={14} />
                <span>{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
