import { Visibility, ExpirationPolicy } from '../../pastes/types/paste';

export interface StoredPasteDefaultsV1 {
  version: 1;
  defaultVisibility: Visibility;
  defaultExpiration: ExpirationPolicy;
  defaultLanguage: string;
  defaultBurnAfterReading: boolean;
}

export interface StoredEditorPrefsV1 {
  version: 1;
  fontSize: '12px' | '14px' | '16px';
  tabSize: 2 | 4;
  lineWrapping: boolean;
  showLineNumbers: boolean;
}

export const PASTE_DEFAULTS_KEY = 'extrabin_paste_defaults_v1';
export const EDITOR_PREFS_KEY = 'extrabin_editor_prefs_v1';

export const SYSTEM_PASTE_DEFAULTS: StoredPasteDefaultsV1 = {
  version: 1,
  defaultVisibility: 'UNLISTED',
  defaultExpiration: 'ONE_WEEK',
  defaultLanguage: 'plaintext',
  defaultBurnAfterReading: false,
};

export const SYSTEM_EDITOR_PREFS: StoredEditorPrefsV1 = {
  version: 1,
  fontSize: '14px',
  tabSize: 2,
  lineWrapping: false,
  showLineNumbers: true,
};

const VALID_VISIBILITIES: Visibility[] = ['PUBLIC', 'UNLISTED', 'PRIVATE'];
const VALID_EXPIRATIONS: ExpirationPolicy[] = [
  'VIEW_ONCE',
  'BURN_AFTER_READING',
  'TEN_MINUTES',
  'ONE_HOUR',
  'ONE_DAY',
  'ONE_WEEK',
  'ONE_MONTH',
  'SIX_MONTHS',
  'ONE_YEAR',
  'NEVER',
];
const VALID_FONT_SIZES = ['12px', '14px', '16px'];
const VALID_TAB_SIZES = [2, 4];

export function loadPasteDefaults(): StoredPasteDefaultsV1 {
  try {
    const raw = localStorage.getItem(PASTE_DEFAULTS_KEY);
    if (!raw) return { ...SYSTEM_PASTE_DEFAULTS };

    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.version === 1 &&
      VALID_VISIBILITIES.includes(parsed.defaultVisibility) &&
      VALID_EXPIRATIONS.includes(parsed.defaultExpiration) &&
      typeof parsed.defaultLanguage === 'string' &&
      typeof parsed.defaultBurnAfterReading === 'boolean'
    ) {
      return {
        version: 1,
        defaultVisibility: parsed.defaultVisibility,
        defaultExpiration: parsed.defaultExpiration,
        defaultLanguage: parsed.defaultLanguage,
        defaultBurnAfterReading: parsed.defaultBurnAfterReading,
      };
    }
  } catch {
    // Malformed JSON or storage access blocked
  }
  return { ...SYSTEM_PASTE_DEFAULTS };
}

export function savePasteDefaults(defaults: StoredPasteDefaultsV1): void {
  try {
    localStorage.setItem(PASTE_DEFAULTS_KEY, JSON.stringify(defaults));
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    throw err;
  }
}

export function loadEditorPrefs(): StoredEditorPrefsV1 {
  try {
    const raw = localStorage.getItem(EDITOR_PREFS_KEY);
    if (!raw) return { ...SYSTEM_EDITOR_PREFS };

    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.version === 1 &&
      VALID_FONT_SIZES.includes(parsed.fontSize) &&
      VALID_TAB_SIZES.includes(parsed.tabSize) &&
      typeof parsed.lineWrapping === 'boolean' &&
      typeof parsed.showLineNumbers === 'boolean'
    ) {
      return {
        version: 1,
        fontSize: parsed.fontSize,
        tabSize: parsed.tabSize,
        lineWrapping: parsed.lineWrapping,
        showLineNumbers: parsed.showLineNumbers,
      };
    }
  } catch {
    // Malformed JSON or storage access blocked
  }
  return { ...SYSTEM_EDITOR_PREFS };
}

export function saveEditorPrefs(prefs: StoredEditorPrefsV1): void {
  try {
    localStorage.setItem(EDITOR_PREFS_KEY, JSON.stringify(prefs));
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    throw err;
  }
}
