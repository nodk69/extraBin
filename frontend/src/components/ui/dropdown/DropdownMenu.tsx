import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  useId,
} from 'react';
import './dropdown.css';

interface DropdownContextValue {
  isOpen: boolean;
  openMenu: () => void;
  closeMenu: (restoreFocus?: boolean) => void;
  toggleMenu: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuId: string;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

export function useDropdown() {
  const ctx = useContext(DropdownContext);
  if (!ctx) {
    throw new Error('useDropdown must be used within a DropdownMenu');
  }
  return ctx;
}

export interface DropdownMenuProps {
  children: React.ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  children,
  className = '',
  onOpenChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const openMenu = useCallback(() => {
    setIsOpen(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  const closeMenu = useCallback(
    (restoreFocus = true) => {
      setIsOpen(false);
      onOpenChange?.(false);
      if (restoreFocus) {
        triggerRef.current?.focus();
      }
    },
    [onOpenChange]
  );

  const toggleMenu = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      onOpenChange?.(next);
      return next;
    });
  }, [onOpenChange]);

  // Pointerdown outside dismissal
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
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
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  // Auto-focus the first interactive item when menu opens
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const firstFocusable = menuRef.current.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, [isOpen]);

  return (
    <DropdownContext.Provider
      value={{
        isOpen,
        openMenu,
        closeMenu,
        toggleMenu,
        triggerRef,
        menuRef,
        menuId,
      }}
    >
      <div className={`relative inline-block text-left ${className}`}>{children}</div>
    </DropdownContext.Provider>
  );
};

export interface DropdownTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  asChild?: boolean;
}

export const DropdownTrigger = React.forwardRef<HTMLButtonElement, DropdownTriggerProps>(
  ({ children, className = '', onClick, ...props }, forwardedRef) => {
    const { isOpen, toggleMenu, triggerRef, menuId } = useDropdown();

    return (
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (typeof forwardedRef === 'function') {
            forwardedRef(node);
          } else if (forwardedRef) {
            forwardedRef.current = node;
          }
        }}
        type="button"
        aria-controls={menuId}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) {
            toggleMenu();
          }
        }}
        className={className}
        {...props}
      >
        {children}
      </button>
    );
  }
);
DropdownTrigger.displayName = 'DropdownTrigger';

export interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
}

export const DropdownMenuContent: React.FC<DropdownMenuContentProps> = ({
  children,
  className = '',
  align = 'right',
  width,
  style,
  ...props
}) => {
  const { isOpen, menuRef, menuId } = useDropdown();

  if (!isOpen) return null;

  const alignClass = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      style={{
        width,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: 'min(85vh, 480px)',
        overflowY: 'auto',
        ...style,
      }}
      className={`absolute ${alignClass} top-full mt-2 extrabin-dropdown-menu z-50 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
