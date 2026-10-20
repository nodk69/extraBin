import { useState, useEffect, useRef, useCallback } from 'react';
import { Visibility, ExpirationPolicy } from '../types/paste';
import { EditorFile } from '../pages/CreatePastePage';

export interface PasteDraft {
  version: 1;
  savedAt: number;
  title: string;
  files: EditorFile[];
  privacy: Visibility;
  expiry: ExpirationPolicy;
  category: string;
  tags: string;
  folder: string;
  burnAfterReading: boolean;
}

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface UseDraftAutosaveProps {
  userId?: number;
  title: string;
  files: EditorFile[];
  privacy: Visibility;
  expiry: ExpirationPolicy;
  category: string;
  tags: string;
  folder: string;
  burnAfterReading: boolean;
  starterCode?: string;
  onRestore: (draft: PasteDraft) => void;
}

export function getDraftStorageKey(userId?: number): string {
  return userId ? `extrabin_draft_v1_user_${userId}` : 'extrabin_draft_v1_anon';
}

export function useDraftAutosave({
  userId,
  title,
  files,
  privacy,
  expiry,
  category,
  tags,
  folder,
  burnAfterReading,
  starterCode,
  onRestore,
}: UseDraftAutosaveProps) {
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [recoverableDraft, setRecoverableDraft] = useState<PasteDraft | null>(null);

  const debounceTimerRef = useRef<number | null>(null);
  const storageKey = getDraftStorageKey(userId);
  const isInitialMount = useRef(true);

  // Check for existing draft on mount or when account changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as PasteDraft;
        if (parsed && parsed.version === 1 && Array.isArray(parsed.files) && parsed.files.length > 0) {
          // Check if stored draft has meaningful content
          const hasContent =
            parsed.title?.trim() ||
            parsed.files.some(
              (f) => f.content && f.content.trim() && f.content !== starterCode
            ) ||
            parsed.files.length > 1;

          if (hasContent) {
            setRecoverableDraft(parsed);
          }
        }
      } else {
        setRecoverableDraft(null);
      }
    } catch (err) {
      // Corrupt data: remove safely
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore storage access errors
      }
      setRecoverableDraft(null);
    }
  }, [storageKey, starterCode]);

  const saveCurrentDraft = useCallback(() => {
    // Only save if content is meaningful (not empty or pristine starter code)
    const isPristine =
      !title.trim() &&
      files.length === 1 &&
      (files[0].content === starterCode || !files[0].content.trim()) &&
      files[0].filename === 'main.js';

    if (isPristine) {
      return;
    }

    const draft: PasteDraft = {
      version: 1,
      savedAt: Date.now(),
      title,
      files,
      privacy,
      expiry,
      category,
      tags,
      folder,
      burnAfterReading,
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setDraftStatus('saved');
      setLastSavedAt(draft.savedAt);
    } catch (err) {
      setDraftStatus('failed');
    }
  }, [storageKey, title, files, privacy, expiry, category, tags, folder, burnAfterReading, starterCode]);

  // Debounced autosave on edits
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    setDraftStatus('saving');
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      saveCurrentDraft();
    }, 800);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [title, files, privacy, expiry, category, tags, folder, burnAfterReading, saveCurrentDraft]);

  // Window unload persistence
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveCurrentDraft();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [saveCurrentDraft]);

  const restoreDraft = useCallback(() => {
    if (recoverableDraft) {
      onRestore(recoverableDraft);
      setRecoverableDraft(null);
      setDraftStatus('saved');
      setLastSavedAt(recoverableDraft.savedAt);
    }
  }, [recoverableDraft, onRestore]);

  const discardDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setRecoverableDraft(null);
    setDraftStatus('idle');
    setLastSavedAt(null);
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setDraftStatus('idle');
    setLastSavedAt(null);
    setRecoverableDraft(null);
  }, [storageKey]);

  return {
    draftStatus,
    lastSavedAt,
    recoverableDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  };
}
