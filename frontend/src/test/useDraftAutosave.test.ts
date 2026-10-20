import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraftAutosave, getDraftStorageKey, PasteDraft } from '../features/pastes/hooks/useDraftAutosave';
import { EditorFile } from '../features/pastes/pages/CreatePastePage';

describe('useDraftAutosave', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('generates account-isolated storage keys', () => {
    expect(getDraftStorageKey(undefined)).toBe('extrabin_draft_v1_anon');
    expect(getDraftStorageKey(123)).toBe('extrabin_draft_v1_user_123');
    expect(getDraftStorageKey(456)).toBe('extrabin_draft_v1_user_456');
  });

  it('debounces saving draft after edits', () => {
    const files: EditorFile[] = [
      { id: 'f1', filename: 'test.js', content: 'console.log("edited")', language: 'javascript' },
    ];
    const onRestore = vi.fn();

    const { result, rerender } = renderHook(
      ({ title }) =>
        useDraftAutosave({
          userId: 1,
          title,
          files,
          privacy: 'UNLISTED',
          expiry: 'ONE_WEEK',
          category: 'none',
          tags: '',
          folder: 'root',
          burnAfterReading: false,
          starterCode: '// starter',
          onRestore,
        }),
      { initialProps: { title: 'First Title' } }
    );

    // Initial mount shouldn't immediately trigger debounce
    expect(localStorage.getItem('extrabin_draft_v1_user_1')).toBeNull();

    // Trigger edit
    rerender({ title: 'Updated Title' });
    expect(result.current.draftStatus).toBe('saving');

    // Advance timers by 800ms
    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(result.current.draftStatus).toBe('saved');
    const stored = localStorage.getItem('extrabin_draft_v1_user_1');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.title).toBe('Updated Title');
    expect(parsed.files[0].content).toBe('console.log("edited")');
  });

  it('recovers draft on mount and allows restore and discard', () => {
    const existingDraft: PasteDraft = {
      version: 1,
      savedAt: Date.now() - 5000,
      title: 'Previous Draft',
      files: [{ id: 'd1', filename: 'draft.ts', content: 'const x = 42;', language: 'typescript' }],
      privacy: 'PUBLIC',
      expiry: 'ONE_DAY',
      category: 'code',
      tags: 'ts',
      folder: 'root',
      burnAfterReading: false,
    };
    localStorage.setItem('extrabin_draft_v1_user_2', JSON.stringify(existingDraft));

    const onRestore = vi.fn();
    const { result } = renderHook(() =>
      useDraftAutosave({
        userId: 2,
        title: '',
        files: [{ id: 'f1', filename: 'main.js', content: '', language: 'plaintext' }],
        privacy: 'UNLISTED',
        expiry: 'ONE_WEEK',
        category: 'none',
        tags: '',
        folder: 'root',
        burnAfterReading: false,
        onRestore,
      })
    );

    expect(result.current.recoverableDraft).not.toBeNull();
    expect(result.current.recoverableDraft?.title).toBe('Previous Draft');

    // Test Restore
    act(() => {
      result.current.restoreDraft();
    });
    expect(onRestore).toHaveBeenCalledWith(existingDraft);
    expect(result.current.recoverableDraft).toBeNull();

    // Test Discard
    act(() => {
      result.current.discardDraft();
    });
    expect(localStorage.getItem('extrabin_draft_v1_user_2')).toBeNull();
  });

  it('safely handles corrupted JSON in localStorage without throwing', () => {
    localStorage.setItem('extrabin_draft_v1_anon', '{invalid-json:::');
    const onRestore = vi.fn();

    const { result } = renderHook(() =>
      useDraftAutosave({
        title: '',
        files: [{ id: 'f1', filename: 'main.js', content: '', language: 'plaintext' }],
        privacy: 'UNLISTED',
        expiry: 'ONE_WEEK',
        category: 'none',
        tags: '',
        folder: 'root',
        burnAfterReading: false,
        onRestore,
      })
    );

    expect(result.current.recoverableDraft).toBeNull();
    expect(localStorage.getItem('extrabin_draft_v1_anon')).toBeNull();
  });
});
