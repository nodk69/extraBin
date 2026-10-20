import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../../components/ui/PaperIcon';
import { ShowcaseScene, ShowcaseSceneDef, ShowcaseTarget } from './types';
import { SHOWCASE_PREVIEW } from './showcaseFixtures';

interface EditorShowcaseOverlayProps {
  scene: ShowcaseScene;
  sceneDef?: ShowcaseSceneDef;
  sceneIndex: number;
  sceneCount: number;
  isPaused: boolean;
  isCompleted: boolean;
  stepperMode: boolean;
  onNext: () => void;
  onPrev: () => void;
  onTryIt: () => void;
}

/** Rect of the current scene's pointer target, re-measured per scene + resize.
 *  If the target sits outside the viewport (e.g. the settings panel stacks below
 *  the editor on narrow/medium layouts) it is scrolled into view first, so the
 *  spotlight, caption and arrow always point at something the visitor can see. */
function useTargetRect(target: ShowcaseTarget | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(
    (allowScroll: boolean) => {
      if (!target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-showcase-target="${target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const first = el.getBoundingClientRect();
      const offscreen =
        first.bottom < 0 ||
        first.top > window.innerHeight ||
        first.right < 0 ||
        first.left > window.innerWidth;
      if (allowScroll && offscreen) {
        el.scrollIntoView({ block: 'center', behavior: 'auto' });
        // re-measure right after the scroll lands
        window.setTimeout(() => setRect(el.getBoundingClientRect()), 60);
        return;
      }
      setRect(first);
    },
    [target]
  );

  useEffect(() => {
    measure(true);
    const onResize = () => measure(false);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [measure]);

  return rect;
}

/**
 * A gliding pointer that eases toward the current target, presses, and ripples.
 * Position is measured once per scene (never per frame); only transform/opacity
 * are animated, via the Web Animations API.
 */
function GhostCursor({ targetRect, reduced }: { targetRect: DOMRect | null; reduced: boolean }) {
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const rippleRef = useRef<HTMLSpanElement | null>(null);
  const fromRef = useRef<{ x: number; y: number } | null>(null);
  const animsRef = useRef<Animation[]>([]);

  useEffect(() => {
    const el = cursorRef.current;
    if (!el || reduced || !targetRect) return;

    animsRef.current.forEach((a) => a.cancel());
    animsRef.current = [];

    const to = { x: targetRect.left + Math.min(60, targetRect.width / 2), y: targetRect.top + 28 };
    const from = fromRef.current ?? { x: window.innerWidth - 60, y: window.innerHeight - 80 };
    fromRef.current = to;

    if (typeof el.animate !== 'function') {
      el.style.transform = `translate(${to.x}px, ${to.y}px)`;
      return;
    }

    const glide = el.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) scale(1)` },
        { transform: `translate(${to.x}px, ${to.y}px) scale(1)` },
      ],
      { duration: 620, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
    );
    animsRef.current.push(glide);

    glide.finished
      .then(() => {
        const press = el.animate(
          [
            { transform: `translate(${to.x}px, ${to.y}px) scale(1)` },
            { transform: `translate(${to.x}px, ${to.y}px) scale(.78)` },
            { transform: `translate(${to.x}px, ${to.y}px) scale(1)` },
          ],
          { duration: 260, easing: 'ease-out', fill: 'forwards' }
        );
        animsRef.current.push(press);
        const ripple = rippleRef.current;
        if (ripple) {
          const r = ripple.animate(
            [
              { transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.55 },
              { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 },
            ],
            { duration: 700, easing: 'cubic-bezier(.2,.7,.3,1)' }
          );
          animsRef.current.push(r);
        }
      })
      .catch(() => {
        /* animation cancelled by unmount/scene change: nothing to do */
      });
  }, [targetRect, reduced]);

  useEffect(() => {
    const anims = animsRef.current;
    return () => anims.forEach((a) => a.cancel());
  }, []);

  if (reduced || !targetRect) return null;
  return (
    <div className="showcase-cursor" ref={cursorRef} aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M4 2 L4 18 L8.5 14 L11.5 20.5 L14.5 19 L11.5 12.5 L17 12 Z" fill="#17201d" stroke="#c6f05b" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span className="showcase-ripple" ref={rippleRef} aria-hidden="true" />
    </div>
  );
}

/** A curved SVG arrow drawn from the caption card to the target, on every scene. */
function DrawnArrow({
  from,
  to,
  reduced,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  reduced: boolean;
}) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const path = useMemo(() => {
    const mx = (from.x + to.x) / 2;
    const my = Math.min(from.y, to.y) - Math.max(24, Math.abs(to.x - from.x) * 0.18);
    return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
  }, [from, to]);

  useEffect(() => {
    const el = pathRef.current;
    if (!el || reduced) return;
    let length = 240;
    try {
      length = el.getTotalLength();
    } catch {
      // jsdom has no getTotalLength
    }
    if (typeof el.animate !== 'function') return;
    const anim = el.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
      duration: 460,
      easing: 'ease-out',
      fill: 'forwards',
    });
    return () => anim.cancel();
  }, [path, reduced]);

  if (reduced) return null;
  return (
    <svg className="showcase-arrow-layer" aria-hidden="true">
      <path
        ref={pathRef}
        d={path}
        className="showcase-arrow-path"
        fill="none"
        markerEnd="url(#showcase-arrowhead)"
      />
      <defs>
        <marker id="showcase-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 z" fill="#ff5c3d" />
        </marker>
      </defs>
    </svg>
  );
}

/** Caption card placement. NEVER covers the target: picks a free region around it. */
function useCaptionPlacement(targetRect: DOMRect | null) {
  return useMemo(() => {
    if (!targetRect) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = Math.min(300, vw - 24);
    const cardH = 168;

    if (vw < 768) {
      // Narrow screens: anchor as a bottom sheet above the fold content.
      return {
        left: 12,
        top: vh - cardH - 12,
        width: vw - 24,
        sheet: true,
        anchor: { x: vw / 2, y: vh - cardH - 20 },
      };
    }

    const wideTarget = targetRect.width > vw * 0.55;

    if (wideTarget) {
      // Full-width target: park the caption above or below it, whichever fits.
      const below = vh - targetRect.bottom;
      const above = targetRect.top;
      if (below >= cardH + 24) {
        const top = targetRect.bottom + 16;
        return { left: Math.min(targetRect.left, vw - cardW - 16), top, width: cardW, sheet: false, anchor: { x: Math.min(targetRect.left, vw - cardW - 16) + cardW / 2, y: top - 10 } };
      }
      if (above >= cardH + 24) {
        const top = Math.max(12, targetRect.top - cardH - 16);
        return { left: Math.min(targetRect.left, vw - cardW - 16), top, width: cardW, sheet: false, anchor: { x: Math.min(targetRect.left, vw - cardW - 16) + cardW / 2, y: top + cardH + 10 } };
      }
      // Neither side fits: bottom-right corner of the viewport, below the fold.
      const top = Math.max(12, vh - cardH - 16);
      return { left: vw - cardW - 16, top, width: cardW, sheet: false, anchor: { x: vw - cardW - 16 + cardW / 2, y: top - 10 } };
    }

    const spaceRight = vw - targetRect.right;
    const spaceLeft = targetRect.left;
    const onRight = spaceRight >= cardW + 32;
    const onLeft = !onRight && spaceLeft >= cardW + 32;
    const left = onRight
      ? Math.min(targetRect.right + 28, vw - cardW - 16)
      : onLeft
        ? Math.max(16, targetRect.left - cardW - 28)
        : vw - cardW - 16; // no side room: pin to the right edge (target is small)
    const top = Math.max(16, Math.min(targetRect.top + targetRect.height / 2 - 70, vh - cardH - 16));
    const anchor = onRight
      ? { x: left, y: top + 56 }
      : onLeft
        ? { x: left + cardW, y: top + 56 }
        : { x: left + cardW / 2, y: targetRect.top - 8 };
    return { left, top, width: cardW, sheet: false, anchor };
  }, [targetRect]);
}

export const EditorShowcaseOverlay: React.FC<EditorShowcaseOverlayProps> = ({
  scene,
  sceneDef,
  sceneIndex,
  sceneCount,
  isPaused,
  isCompleted,
  stepperMode,
  onNext,
  onPrev,
  onTryIt,
}) => {
  const targetRect = useTargetRect(stepperMode || scene === 'complete' ? null : sceneDef?.target ?? null);
  const placement = useCaptionPlacement(targetRect);
  const tryBtnRef = useRef<HTMLButtonElement | null>(null);
  const reduced = stepperMode;

  // Focus only at the final handover.
  useEffect(() => {
    if (scene === 'complete') {
      tryBtnRef.current?.focus();
    }
  }, [scene]);

  const arrowFrom = placement?.anchor ?? null;
  const arrowTo = targetRect
    ? {
        x: Math.max(24, Math.min(targetRect.left + targetRect.width / 2, window.innerWidth - 24)),
        y: Math.max(24, targetRect.top - 6),
      }
    : null;

  if (scene === 'complete' || scene === 'share' || scene === 'share-preview') {
    return (
      <div className="showcase-preview-backdrop" role="dialog" aria-modal="false" aria-label="Simulated share preview">
        <div className="showcase-preview-card">
          <div className="showcase-preview-badge">
            <span className="showcase-badge-pill">PREVIEW</span>
            <span className="text-xs text-[#a6aea9]">No backend paste created</span>
          </div>

          <div className="showcase-preview-check" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path
                className="showcase-check-path"
                d="M4 12.5 L9.5 18 L20 6.5"
                stroke="#c6f05b"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
              />
            </svg>
          </div>

          <h3 className="showcase-preview-title">Your code is ready to share.</h3>
          <p className="showcase-preview-desc">
            One click produces a short link: multi-file, syntax-highlighted, with the privacy
            you picked. This is a demo — nothing was created.
          </p>

          <div className="showcase-preview-link-box">
            <Icon name="external-link" size={16} className="text-[#ff5c3d] flex-shrink-0" />
            <span className="showcase-preview-url showcase-shimmer" aria-hidden="true">
              {SHOWCASE_PREVIEW.simulatedUrl}
            </span>
            <span className="showcase-simulated-tag">demo</span>
          </div>
          <span className="sr-only">Preview link: extraBin example path, not clickable</span>

          {/* 2026 Marketing: Share anywhere (QR, curl, iframe embed) */}
          <div className="showcase-preview-split" aria-label="Multi-channel sharing preview">
            <div className="showcase-split-col">
              <div className="showcase-split-head">
                <Icon name="qr" size={13} className="text-[#c6f05b]" />
                <span>QR Code</span>
              </div>
              <div className="showcase-mini-qr" aria-hidden="true">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm14 0h4v4h-4v-4zm-4-2h2v2h-2v-2zm2 6h4v2h-4v-2zm-2-2h2v4h-2v-4z" />
                </svg>
                <span className="text-[10px] text-[#a6aea9]">Mobile scan</span>
              </div>
            </div>

            <div className="showcase-split-col">
              <div className="showcase-split-head">
                <Icon name="code" size={13} className="text-[#c6f05b]" />
                <span>CLI / curl</span>
              </div>
              <code className="showcase-mini-code" title={SHOWCASE_PREVIEW.curlSnippet}>
                {SHOWCASE_PREVIEW.curlSnippet}
              </code>
            </div>

            <div className="showcase-split-col">
              <div className="showcase-split-head">
                <Icon name="code" size={13} className="text-[#c6f05b]" />
                <span>Web Embed</span>
              </div>
              <code className="showcase-mini-code" title={SHOWCASE_PREVIEW.embedSnippet}>
                {SHOWCASE_PREVIEW.embedSnippet}
              </code>
            </div>
          </div>

          <div className="showcase-preview-meta">
            <span>4 files</span>
            <span>•</span>
            <span>Unlisted</span>
            <span>•</span>
            <span>Password protected</span>
            <span>•</span>
            <span className="showcase-kbd-pulse">
              <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
            </span>
          </div>

          <div className="showcase-preview-actions">
            <button
              type="button"
              ref={tryBtnRef}
              onClick={onTryIt}
              className="showcase-takeover-btn"
            >
              <Icon name="check" size={16} />
              <span>Try it yourself</span>
            </button>
          </div>

          {stepperMode && scene !== 'complete' && (
            <div className="showcase-stepper-actions">
              <button type="button" onClick={onPrev} aria-label="Previous step">
                Back
              </button>
              <button type="button" onClick={onNext} aria-label="Next step">
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="showcase-stage">
      {/* Spotlight: dim layer with a cutout ring around the target (never eats clicks) */}
      {targetRect && (
        <>
          <div className="showcase-dim" aria-hidden="true" />
          <div
            className="showcase-spot"
            aria-hidden="true"
            style={{
              transform: `translate(${targetRect.left - 6}px, ${targetRect.top - 6}px)`,
              width: targetRect.width + 12,
              height: targetRect.height + 12,
            }}
          />
          <div
            className="showcase-spot showcase-spot-soft"
            aria-hidden="true"
            style={{
              transform: `translate(${targetRect.left - 10}px, ${targetRect.top - 10}px)`,
              width: targetRect.width + 20,
              height: targetRect.height + 20,
            }}
          />
        </>
      )}

      {/* Trust Scene: live two-line diff teaser + draft autosaved pulse */}
      {scene === 'trust' && targetRect && (
        <div
          className="showcase-diff-teaser"
          aria-hidden="true"
          style={{
            transform: `translate(${Math.max(16, targetRect.left + 36)}px, ${Math.max(16, targetRect.top + 40)}px)`,
            maxWidth: Math.min(targetRect.width - 72, 580),
          }}
        >
          <div className="showcase-diff-header">
            <div className="showcase-diff-title">
              <Icon name="history" size={13} className="text-[#c6f05b]" />
              <span>Revision v1 → v2 (live line diff)</span>
            </div>
            <span className="showcase-draft-badge">
              <span className="showcase-pulse-dot-lime" />
              Draft autosaved locally
            </span>
          </div>
          <div className="showcase-diff-lines">
            <div className="showcase-diff-line diff-del">
              <span className="diff-marker">-</span>
              <code>export function oldHandler(req) &#123; return false; &#125;</code>
            </div>
            <div className="showcase-diff-line diff-add">
              <span className="diff-marker">+</span>
              <code>export function newHandler(req) &#123; return true; &#125;</code>
            </div>
          </div>
        </div>
      )}

      {arrowFrom && arrowTo && !placement?.sheet && (
        <DrawnArrow from={arrowFrom} to={arrowTo} reduced={reduced} />
      )}
      <GhostCursor targetRect={targetRect} reduced={reduced} />

      {sceneDef && placement && !isCompleted && (
        <div
          className={`showcase-caption ${placement.sheet ? 'showcase-caption-sheet' : ''}`}
          aria-hidden={!stepperMode}
          style={{ left: placement.left, top: placement.top, width: placement.width }}
        >
          <div className="showcase-caption-chip">
            <span className="showcase-caption-step">{sceneDef.step}</span>
            <span className="showcase-caption-count">
              {sceneIndex + 1}/{sceneCount}
            </span>
          </div>
          <strong className="showcase-caption-title">{sceneDef.title}</strong>
          <span className="showcase-caption-body">{sceneDef.body}</span>
          {stepperMode && (
            <div className="showcase-stepper-actions" aria-hidden="false">
              <button type="button" onClick={onPrev} aria-label="Previous step">
                Back
              </button>
              <button type="button" onClick={onNext} aria-label="Next step">
                Next
              </button>
            </div>
          )}
          {isPaused && <span className="showcase-caption-paused">paused</span>}
        </div>
      )}
    </div>
  );
};
