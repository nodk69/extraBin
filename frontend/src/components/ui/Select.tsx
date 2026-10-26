import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './PaperIcon';
import './Select.css';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;          // small mono text on the right, e.g. "7d"
  description?: string;   // second line under the label
  disabled?: boolean;
  icon?: React.ReactNode; // optional leading icon
}

export interface SelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  id?: string;
  name?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;            // show a filter box (use for long lists like languages)
  variant?: 'light' | 'dark';      // dark = for the editor toolbar
  size?: 'md' | 'sm';
  menuWidth?: number;              // min width of the popover in px
  className?: string;
  popoverClassName?: string;
}

interface Pos {
  left: number;
  width: number;
  maxH: number;
  top?: number;
  bottom?: number;
  flip: boolean;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  id,
  name,
  ariaLabel,
  placeholder = 'Select…',
  disabled = false,
  searchable = false,
  variant = 'light',
  size = 'md',
  menuWidth = 0,
  className = '',
  popoverClassName = '',
}: SelectProps<T>) {
  const uid = useId();
  const trigRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeBuf = useRef({ text: '', timer: 0 });

  const isKeyboardNavRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.hint && o.hint.toLowerCase().includes(q))) : options;
  }, [options, query]);

  const place = useCallback(() => {
    const el = trigRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const flip = below < 220 && above > below;
    const room = flip ? above : below;

    // Generous default menu width so labels, hints, and descriptions are never cut,
    // but strictly clamped to window.innerWidth - 16 so it never bleeds offscreen on small devices.
    const defaultMin = 280;
    const computedMinMenuWidth = menuWidth > 0 ? menuWidth : defaultMin;
    const maxViewportWidth = Math.max(120, window.innerWidth - 16);
    const targetWidth = Math.min(Math.max(r.width, computedMinMenuWidth), maxViewportWidth);

    // If opening near the right edge of the viewport, anchor popover to trigger's right edge
    let idealLeft = r.left;
    if (r.left + targetWidth > window.innerWidth - 8 && r.right - targetWidth >= 8) {
      idealLeft = r.right - targetWidth;
    }
    const clampLeft = Math.max(8, Math.min(idealLeft, window.innerWidth - targetWidth - 8));
    const nextMaxH = Math.max(160, Math.min(360, room) - 8);
    const nextTop = flip ? undefined : r.bottom + 6;
    const nextBottom = flip ? window.innerHeight - r.top + 6 : undefined;

    setPos((prev) => {
      if (
        prev &&
        prev.left === clampLeft &&
        prev.width === targetWidth &&
        prev.maxH === nextMaxH &&
        prev.flip === flip &&
        prev.top === nextTop &&
        prev.bottom === nextBottom
      ) {
        return prev;
      }
      return {
        left: clampLeft,
        width: targetWidth,
        maxH: nextMaxH,
        flip,
        top: nextTop,
        bottom: nextBottom,
      };
    });
  }, [menuWidth]);

  const openMenu = () => {
    if (disabled) return;
    isKeyboardNavRef.current = true;
    place();
    setQuery('');
    const idx = options.findIndex((o) => o.value === value);
    setActive(Math.max(0, idx));
    setOpen(true);
  };

  const closeMenu = (refocus = true) => {
    setOpen(false);
    if (refocus) trigRef.current?.focus();
  };

  const choose = (i: number) => {
    const o = filtered[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    closeMenu();
  };

  const step = (dir: 1 | -1, from = active) => {
    if (!filtered.length) return;
    let i = from;
    for (let n = 0; n < filtered.length; n++) {
      i = (i + dir + filtered.length) % filtered.length;
      if (!filtered[i].disabled) {
        isKeyboardNavRef.current = true;
        setActive(i);
        return;
      }
    }
  };

  // Keep the popover glued to the trigger on window scroll & resize
  useLayoutEffect(() => {
    if (!open) return;
    place();

    const onScroll = (e: Event) => {
      // Ignore scroll events originating from inside the popover itself (e.g. scrolling the options list)
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) {
        return;
      }
      place();
    };

    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place]);

  // Outside click listener
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !trigRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open && searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, searchable]);

  // Only scroll active option into view when navigating via keyboard or initial open
  useEffect(() => {
    if (!open) return;
    if (!isKeyboardNavRef.current) return;
    isKeyboardNavRef.current = false;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openMenu();
      step(k === 'ArrowDown' ? 1 : -1);
    } else if (k === 'Home' || k === 'End') {
      if (!open) return;
      e.preventDefault();
      const idx = k === 'Home' ? 0 : filtered.length - 1;
      isKeyboardNavRef.current = true;
      setActive(idx);
    } else if (k === 'Enter' || (k === ' ' && !(searchable && open))) {
      e.preventDefault();
      open ? choose(active) : openMenu();
    } else if (k === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }
    } else if (k === 'Tab') {
      setOpen(false);
    } else if (!searchable && k.length === 1 && !e.metaKey && !e.ctrlKey) {
      // Typeahead on plain selects
      const b = typeBuf.current;
      window.clearTimeout(b.timer);
      b.text += k.toLowerCase();
      b.timer = window.setTimeout(() => (b.text = ''), 600);
      const i = filtered.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(b.text));
      if (i >= 0) {
        isKeyboardNavRef.current = true;
        if (!open) openMenu();
        setActive(i);
      }
    }
  };

  const activeId = open && filtered[active] ? `${uid}-o${active}` : undefined;

  return (
    <div className={`pp-sel pp-sel--${variant} pp-sel--${size} ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}
      {(id || name) && (
        <select
          id={id}
          name={name}
          aria-label={ariaLabel}
          tabIndex={-1}
          value={value}
          onChange={(e) => {
            onChange(e.target.value as T);
          }}
          style={{
            position: 'absolute',
            border: 0,
            clip: 'rect(0 0 0 0)',
            height: '1px',
            margin: '-1px',
            overflow: 'hidden',
            padding: 0,
            width: '1px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {options.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      <button
        ref={trigRef}
        id={id ? `${id}-trigger` : undefined}
        type="button"
        role="combobox"
        value={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-activedescendant={searchable ? undefined : activeId}
        aria-label={id || name ? undefined : ariaLabel}
        disabled={disabled}
        data-open={open}
        className="pp-sel__trigger"
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={`pp-sel__value ${selected ? '' : 'is-placeholder'}`}>
          {selected?.icon && <span className="pp-sel__opt-icon">{selected.icon}</span>}
          {selected ? (
            <>
              <span className="pp-sel__label-full">{selected.label}</span>
              {selected.hint && <span className="pp-sel__label-short">{selected.hint}</span>}
            </>
          ) : (
            <span>{placeholder}</span>
          )}
        </span>
        {selected?.hint && <span className="pp-sel__hint">{selected.hint}</span>}
        <span className="pp-sel__chev" aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          className={`pp-sel__pop pp-sel--${variant} ${className?.includes('font-mono') ? 'pp-sel__pop--mono' : ''} ${popoverClassName}`.trim()}
          data-flip={pos.flip}
          style={{
            left: pos.left,
            width: pos.width,
            top: pos.top,
            bottom: pos.bottom,
            maxHeight: pos.maxH,
          }}
        >
          {searchable && (
            <div className="pp-sel__search">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  isKeyboardNavRef.current = true;
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Filter…"
                aria-label="Filter options"
                aria-controls={`${uid}-list`}
                aria-activedescendant={activeId}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={`${uid}-list`}
            role="listbox"
            className="pp-sel__list"
          >
            {filtered.length === 0 && (
              <li className="pp-sel__empty" role="presentation">
                No matches
              </li>
            )}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${uid}-o${i}`}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                data-active={i === active}
                className="pp-sel__opt"
                onMouseMove={() => {
                  if (!o.disabled && i !== active) {
                    isKeyboardNavRef.current = false;
                    setActive(i);
                  }
                }}
                onClick={() => choose(i)}
              >
                {o.icon && <span className="pp-sel__opt-icon">{o.icon}</span>}
                <span className="pp-sel__txt">
                  <span className="pp-sel__label">{o.label}</span>
                  {o.description && <span className="pp-sel__desc">{o.description}</span>}
                </span>
                {o.hint && <span className="pp-sel__hint">{o.hint}</span>}
                <span className="pp-sel__check" aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
              </li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Select;
