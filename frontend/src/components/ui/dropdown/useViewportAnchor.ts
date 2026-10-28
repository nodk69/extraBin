import { useLayoutEffect, type RefObject } from 'react';

const VIEWPORT_MARGIN = 8;
const TRIGGER_OFFSET = 6;

/**
 * Keeps an absolutely positioned menu panel inside the visual viewport.
 *
 * Panels anchored with `right-0` (or `left-0`) overflow as soon as their
 * trigger sits near the opposite edge — which happens constantly once an
 * action toolbar wraps onto a new row on a phone. This hook measures the
 * rendered panel after layout and shifts it back inside the viewport both
 * horizontally and vertically (flipping above the trigger when needed).
 *
 * It only writes inline offsets, so it composes with the existing utility
 * classes and never changes the panel's width or scrolling behaviour.
 */
export function useViewportAnchoredPanel(
  panelRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  isOpen: boolean
): void {
  useLayoutEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel || !trigger) return;

    const reposition = () => {
      const host = panel.offsetParent instanceof HTMLElement ? panel.offsetParent : panel.parentElement;
      if (!host) return;

      const hostRect = host.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;

      // Prefer right-aligned to the trigger, then clamp to the viewport.
      let left = triggerRect.right - width;
      left = Math.min(Math.max(VIEWPORT_MARGIN, left), viewportWidth - width - VIEWPORT_MARGIN);

      // Prefer below the trigger, flip above when there is no room.
      let top = triggerRect.bottom + TRIGGER_OFFSET;
      if (top + height > viewportHeight - VIEWPORT_MARGIN) {
        top = triggerRect.top - height - TRIGGER_OFFSET;
      }
      top = Math.min(Math.max(VIEWPORT_MARGIN, top), Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN));

      panel.style.left = `${left - hostRect.left}px`;
      panel.style.right = 'auto';
      panel.style.top = `${top - hostRect.top}px`;
      panel.style.marginTop = '0';
    };

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen, panelRef, triggerRef]);
}
