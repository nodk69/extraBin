import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ShowcaseMode,
  ShowcaseScene,
  ShowcaseHighlightedSetting,
  ShowcaseController,
  ShowcaseSceneDef,
} from './types';
import { SHOWCASE_FILES, SHOWCASE_SCENES } from './showcaseFixtures';

export const SHOWCASE_STORAGE_KEY = 'extrabin_showcase_completed_v1';

/** Typing cadence: ~1 char per 16ms, revealed in bursts of 2-6 chars per frame. */
const MS_PER_CHAR = 16;
const LINE_END_PAUSE_MS = 140;
const BURST_PATTERN = [4, 3, 5, 2, 6, 3];

interface UseShowcaseControllerOptions {
  hasRecoverableDraft?: boolean;
  hasUserModifiedContent?: boolean;
  /**
   * Frame scheduler for the typewriter loop. 'raf' in browsers, 'timeout' under
   * test runners with fake timers (vitest fakes Date/setTimeout but not rAF by
   * default, so the loop must be drivable via timers there).
   */
  frameScheduler?: 'raf' | 'timeout';
}

const SCENE_TO_SETTING: Partial<Record<ShowcaseScene, ShowcaseHighlightedSetting>> = {
  expiry: 'expiry',
  visibility: 'visibility',
  protect: 'visibility',
  password: 'password',
  burn: 'burn',
};

export function useShowcaseController(
  options: UseShowcaseControllerOptions = {}
): ShowcaseController {
  const {
    hasRecoverableDraft = false,
    hasUserModifiedContent = false,
    frameScheduler = 'raf',
  } = options;

  const isNarrowScreen = useMemo(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        typeof window.innerWidth === 'number' &&
        window.innerWidth < 768
      );
    } catch {
      return false;
    }
  }, []);

  const scenes = useMemo(() => {
    if (!isNarrowScreen) return SHOWCASE_SCENES;
    return SHOWCASE_SCENES.filter((s) => s.id !== 'expiry' && s.id !== 'trust');
  }, [isNarrowScreen]);

  const prefersReducedMotion = useMemo(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch {
      return false;
    }
  }, []);

  const shouldStartInDemo = useMemo(() => {
    if (typeof window === 'undefined') return false;
    if (hasRecoverableDraft || hasUserModifiedContent) return false;
    try {
      return window.localStorage.getItem(SHOWCASE_STORAGE_KEY) !== 'true';
    } catch {
      return false;
    }
  }, [hasRecoverableDraft, hasUserModifiedContent]);

  const [mode, setMode] = useState<ShowcaseMode>(() =>
    shouldStartInDemo ? 'demo' : 'interactive'
  );
  const [sceneIndex, setSceneIndex] = useState(0);
  const [activeFileId, setActiveFileId] = useState<string>(SHOWCASE_FILES[0].id);
  const [visibleCharacters, setVisibleCharacters] = useState<number>(() =>
    prefersReducedMotion ? SHOWCASE_FILES[0].content.length : 0
  );
  const [languageDetected, setLanguageDetected] = useState(prefersReducedMotion);
  const [isPaused, setIsPaused] = useState(false);
  const [dynamicSetting, setDynamicSetting] = useState<ShowcaseHighlightedSetting>('none');

  const sceneCount = scenes.length;
  const isCompleted = sceneIndex >= sceneCount;
  const activeSceneDef: ShowcaseSceneDef | undefined = scenes[
    Math.min(sceneIndex, sceneCount - 1)
  ];
  const scene: ShowcaseScene = isCompleted ? 'complete' : activeSceneDef!.id;
  const highlightedSetting: ShowcaseHighlightedSetting =
    dynamicSetting !== 'none'
      ? dynamicSetting
      : (SCENE_TO_SETTING[scene] ?? 'none');
  // Reduced motion: static, user-driven step-through (Next/Back), no animation.
  const stepperMode = prefersReducedMotion;

  // ---- async plumbing: generation token + timer/frame registry -------------
  const generationRef = useRef<number>(0);
  const timersRef = useRef<number[]>([]);
  const framesRef = useRef<number[]>([]);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    framesRef.current.forEach((f) => {
      if (frameScheduler === 'raf') window.cancelAnimationFrame(f);
      else window.clearTimeout(f);
    });
    framesRef.current = [];
  }, [frameScheduler]);

  const addTimer = useCallback(
    (fn: () => void, delayMs: number) => {
      const gen = generationRef.current;
      const timer = window.setTimeout(() => {
        if (gen === generationRef.current) fn();
      }, delayMs);
      timersRef.current.push(timer);
      return timer;
    },
    []
  );

  const scheduleFrame = useCallback(
    (fn: (ts: number) => void): number => {
      if (frameScheduler === 'raf' && typeof window.requestAnimationFrame === 'function') {
        const id = window.requestAnimationFrame(fn);
        framesRef.current.push(id);
        return id;
      }
      const id = window.setTimeout(() => fn(Date.now()), 16);
      timersRef.current.push(id);
      return id;
    },
    [frameScheduler]
  );

  const markCompletedInStorage = useCallback(() => {
    try {
      window.localStorage.setItem(SHOWCASE_STORAGE_KEY, 'true');
    } catch {
      // storage blocked (private mode / iframe): demo simply replays next visit
    }
  }, []);

  // ---- transitions --------------------------------------------------------

  const startInteractive = useCallback(() => {
    generationRef.current += 1;
    clearAllTimers();
    setMode('interactive');
    setIsPaused(false);
    markCompletedInStorage();
  }, [clearAllTimers, markCompletedInStorage]);

  const skipDemo = useCallback(() => {
    startInteractive();
  }, [startInteractive]);

  const pauseDemo = useCallback(() => {
    if (mode === 'demo') setIsPaused(true);
  }, [mode]);

  const resumeDemo = useCallback(() => {
    if (mode === 'demo') setIsPaused(false);
  }, [mode]);

  // Escape key immediately halts the demo and hands control to the visitor
  useEffect(() => {
    if (mode !== 'demo') return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        startInteractive();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, startInteractive]);

  const nextScene = useCallback(() => {
    generationRef.current += 1;
    clearAllTimers();
    setDynamicSetting('none');
    setSceneIndex((i) => Math.min(i + 1, sceneCount));
    if (!prefersReducedMotion) setIsPaused(false);
  }, [sceneCount, clearAllTimers, prefersReducedMotion]);

  const prevScene = useCallback(() => {
    generationRef.current += 1;
    clearAllTimers();
    setDynamicSetting('none');
    setSceneIndex((i) => Math.max(0, i - 1));
    setIsPaused(false);
  }, [clearAllTimers]);

  const jumpToScene = useCallback(
    (index: number) => {
      generationRef.current += 1;
      clearAllTimers();
      setDynamicSetting('none');
      const clamped = Math.max(0, Math.min(index, sceneCount));
      setSceneIndex(clamped);
      setIsPaused(false);
      if (clamped === 0) {
        setVisibleCharacters(0);
        setLanguageDetected(false);
        setActiveFileId(SHOWCASE_FILES[0].id);
      }
    },
    [sceneCount, clearAllTimers]
  );

  const replayDemo = useCallback(() => {
    generationRef.current += 1;
    clearAllTimers();
    setMode('demo');
    setSceneIndex(0);
    setActiveFileId(SHOWCASE_FILES[0].id);
    setVisibleCharacters(prefersReducedMotion ? SHOWCASE_FILES[0].content.length : 0);
    setLanguageDetected(prefersReducedMotion);
    setIsPaused(false);
  }, [clearAllTimers, prefersReducedMotion]);

  // Escape stops the demo at any time (spec: interruption rules).
  useEffect(() => {
    if (mode !== 'demo') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        generationRef.current += 1;
        clearAllTimers();
        startInteractive();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, clearAllTimers, startInteractive]);

  // Draft recovery or real user content always wins over the demo.
  useEffect(() => {
    if ((hasRecoverableDraft || hasUserModifiedContent) && mode === 'demo') {
      startInteractive();
    }
  }, [hasRecoverableDraft, hasUserModifiedContent, mode, startInteractive]);

  // ---- timeline -----------------------------------------------------------

  useEffect(() => {
    if (mode !== 'demo' || isPaused || isCompleted || !activeSceneDef) return;

    // Reduced motion: static step-through, nothing auto-advances.
    if (stepperMode) {
      setVisibleCharacters(SHOWCASE_FILES[0].content.length);
      setLanguageDetected(true);
      return;
    }

    const gen = generationRef.current;
    clearAllTimers();

    if (scene === 'paste' || scene === 'typing') {
      const full = SHOWCASE_FILES[0].content;
      const startedAt = Date.now();
      let cursor = Math.min(visibleCharacters, full.length);
      let burstIndex = 0;
      let lastRendered = cursor;

      const frame = () => {
        if (gen !== generationRef.current) return;
        const elapsed = Date.now() - startedAt;
        const budget = Math.floor(elapsed / MS_PER_CHAR);
        // Burst reveal of 2-6 chars per frame; the elapsed-time budget lets the
        // loop catch up if a frame was delayed (never type faster than budget).
        const chunk = BURST_PATTERN[burstIndex % BURST_PATTERN.length];
        burstIndex += 1;
        const next = Math.min(full.length, Math.max(cursor + chunk, budget));
        cursor = next;

        if (cursor !== lastRendered) {
          lastRendered = cursor;
          setVisibleCharacters(cursor);
          const firstBreak = full.indexOf('\n');
          if (firstBreak >= 0 && cursor > firstBreak + 1) {
            setLanguageDetected(true);
          }
        }

        if (cursor >= full.length && elapsed >= activeSceneDef.durationMs - 300) {
          nextScene();
          return;
        }

        // Natural breath at line ends.
        if (cursor > 0 && cursor < full.length && full[cursor - 1] === '\n') {
          addTimer(() => {
            if (gen === generationRef.current) scheduleFrame(frame);
          }, LINE_END_PAUSE_MS);
          return;
        }
        scheduleFrame(frame);
      };
      scheduleFrame(frame);
      return () => clearAllTimers();
    }

    // Non-typing scenes: optional in-scene choreography + auto advance.
    if (scene === 'files' || scene === 'multi-file') {
      const switchFile = (id: string) => {
        if (typeof document !== 'undefined' && 'startViewTransition' in document) {
          try {
            (document as any).startViewTransition(() => setActiveFileId(id));
            return;
          } catch {
            // fallback
          }
        }
        setActiveFileId(id);
      };
      addTimer(() => switchFile(SHOWCASE_FILES[1].id), 500);
      addTimer(() => switchFile(SHOWCASE_FILES[2].id), 1100);
      addTimer(() => switchFile(SHOWCASE_FILES[0].id), 1700);
    }

    if (scene === 'protect') {
      setDynamicSetting('visibility');
      addTimer(() => setDynamicSetting('password'), 1000);
      addTimer(() => setDynamicSetting('burn'), 2000);
    }

    if (scene === 'expiry') {
      setDynamicSetting('expiry');
    }

    addTimer(() => nextScene(), activeSceneDef.durationMs);
    return () => clearAllTimers();
    // visibleCharacters/languageDetected intentionally read once per scene entry:
    // the loop keeps its own cursor, so re-running mid-scene cannot double-type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    scene,
    isPaused,
    isCompleted,
    stepperMode,
    activeSceneDef,
    addTimer,
    scheduleFrame,
    clearAllTimers,
    nextScene,
  ]);

  // Cancel everything on unmount (StrictMode-safe: generation bumps).
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  const activeFile = useMemo(
    () => SHOWCASE_FILES.find((f) => f.id === activeFileId) || SHOWCASE_FILES[0],
    [activeFileId]
  );

  const currentTypedContent = useMemo(() => {
    if (activeFile.id !== SHOWCASE_FILES[0].id) return activeFile.content;
    return activeFile.content.slice(0, visibleCharacters);
  }, [activeFile, visibleCharacters]);

  return {
    mode,
    scene,
    sceneIndex,
    sceneCount,
    scenes: scenes,
    visibleCharacters,
    languageDetected,
    highlightedSetting,
    isPaused,
    isCompleted,
    stepperMode,
    prefersReducedMotion,
    activeFileId,
    activeFile,
    files: SHOWCASE_FILES,
    currentTypedContent,
    skipDemo,
    pauseDemo,
    resumeDemo,
    nextScene,
    prevScene,
    jumpToScene,
    startInteractive,
    replayDemo,
  };
}
