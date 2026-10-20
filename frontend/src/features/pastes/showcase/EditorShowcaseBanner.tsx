import React from 'react';
import { Icon } from '../../../components/ui/PaperIcon';
import { ShowcaseScene, ShowcaseSceneDef } from './types';

interface EditorShowcaseBannerProps {
  scene: ShowcaseScene;
  sceneDef?: ShowcaseSceneDef;
  sceneIndex: number;
  sceneCount: number;
  isPaused: boolean;
  onSkip: () => void;
  onTryIt: () => void;
  onTogglePause: () => void;
  onJump: (index: number) => void;
}

/**
 * Slim top strip shown for the entire demo: DEMO badge, step chip, clickable
 * progress dots with pause/play, Skip (always visible) and Try it yourself.
 * Announce each scene exactly once through a polite live region (never the
 * typed characters, which would flood screen readers).
 */
export const EditorShowcaseBanner: React.FC<EditorShowcaseBannerProps> = ({
  scene,
  sceneDef,
  sceneIndex,
  sceneCount,
  isPaused,
  onSkip,
  onTryIt,
  onTogglePause,
  onJump,
}) => {
  return (
    <div className="showcase-banner" role="region" aria-label="extraBin product tour">
      <div className="showcase-banner-left">
        <div className="showcase-live-indicator" aria-hidden="true">
          <span className="showcase-pulse-dot" />
          <span className="showcase-badge-text">DEMO</span>
        </div>

        <div className="showcase-step-pill" aria-hidden="true">
          <span className="showcase-step-num">{sceneDef ? sceneDef.step : '✓'}</span>
          <span className="showcase-step-count">
            {scene === 'complete' ? sceneCount : sceneIndex + 1}/{sceneCount}
          </span>
        </div>

        {/* Progress rail: clickable dots + pause/play */}
        <div className="showcase-rail" role="group" aria-label="Demo progress">
          {Array.from({ length: sceneCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`showcase-dot ${i === sceneIndex && scene !== 'complete' ? 'active' : ''} ${i < sceneIndex ? 'done' : ''}`}
              onClick={() => onJump(i)}
              aria-label={`Jump to step ${i + 1}`}
              aria-current={i === sceneIndex && scene !== 'complete' ? 'step' : undefined}
            />
          ))}
          <button
            type="button"
            className="showcase-rail-play"
            onClick={onTogglePause}
            aria-label={isPaused ? 'Resume demo' : 'Pause demo'}
          >
            {isPaused ? (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d="M3 1.5 L10 6 L3 10.5 Z" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <rect x="2.5" y="1.5" width="2.5" height="9" rx="1" />
                <rect x="7" y="1.5" width="2.5" height="9" rx="1" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="showcase-banner-actions">
        <button
          type="button"
          onClick={onSkip}
          className="showcase-btn-secondary"
          title="Skip the demonstration and start using the editor"
        >
          <span>Skip demo</span>
        </button>
        <button
          type="button"
          onClick={onTryIt}
          className="showcase-btn-primary"
          title="Take control and edit code directly"
        >
          <Icon name="check" size={13} />
          <span>Try it yourself</span>
        </button>
      </div>

      {/* One polite announcement per scene change; typed characters are never announced. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {sceneDef
          ? `Step ${sceneDef.step} of ${sceneCount}: ${sceneDef.title} ${sceneDef.body}`
          : 'Demo complete. Take control of the editor with the Try it yourself button.'}
      </div>
    </div>
  );
};
