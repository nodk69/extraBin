export type ShowcaseMode = 'demo' | 'interactive';

/**
 * Timed scenes come from SHOWCASE_SCENES; 'complete' is the terminal handoff
 * state (Try it yourself). Every timed scene has exactly one caption + target.
 */
export type ShowcaseScene =
  | 'paste'
  | 'files'
  | 'protect'
  | 'expiry'
  | 'share'
  | 'trust'
  | 'complete'
  | 'typing'
  | 'multi-file'
  | 'visibility'
  | 'password'
  | 'burn'
  | 'share-preview';

export type ShowcaseTarget =
  | 'textarea'
  | 'tabs'
  | 'expiry'
  | 'visibility'
  | 'password'
  | 'burn'
  | 'create';

export type ShowcaseHighlightedSetting =
  | 'none'
  | 'expiry'
  | 'visibility'
  | 'password'
  | 'burn';

export interface ShowcaseFile {
  id: string;
  filename: string;
  content: string;
  language: string;
}

export interface ShowcaseSceneDef {
  id: Exclude<ShowcaseScene, 'complete'>;
  step: string;
  title: string;
  body: string;
  target: ShowcaseTarget;
  durationMs: number;
}

export interface ShowcaseState {
  mode: ShowcaseMode;
  scene: ShowcaseScene;
  sceneIndex: number;
  visibleCharacters: number;
  highlightedSetting: ShowcaseHighlightedSetting;
  isPaused: boolean;
  isCompleted: boolean;
}

export interface ShowcaseController {
  mode: ShowcaseMode;
  scene: ShowcaseScene;
  sceneIndex: number;
  sceneCount: number;
  scenes: ReadonlyArray<ShowcaseSceneDef>;
  visibleCharacters: number;
  /** Flips true once the first line of the demo file has been typed. */
  languageDetected: boolean;
  highlightedSetting: ShowcaseHighlightedSetting;
  isPaused: boolean;
  isCompleted: boolean;
  /** True when the visitor asked for reduced motion: static, user-driven. */
  stepperMode: boolean;
  prefersReducedMotion: boolean;
  activeFileId: string;
  activeFile: ShowcaseFile;
  files: ShowcaseFile[];
  currentTypedContent: string;
  skipDemo: () => void;
  pauseDemo: () => void;
  resumeDemo: () => void;
  nextScene: () => void;
  prevScene: () => void;
  jumpToScene: (index: number) => void;
  startInteractive: () => void;
  replayDemo: () => void;
}
