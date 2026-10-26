import { useState, useRef, useEffect } from 'react';
import { pasteApi } from '../../api/pasteApi';
import { ApiError } from '../../../../lib/api-client/client';
import type { PasteView } from '../../types/paste';

const VIEWED_STORAGE_KEY_PREFIX = 'extraBin_viewed_';
const VIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export const hasRecentlyViewed = (pasteId: string): boolean => {
  try {
    const raw = localStorage.getItem(`${VIEWED_STORAGE_KEY_PREFIX}${pasteId}`);
    if (!raw) return false;
    const timestamp = parseInt(raw, 10);
    if (isNaN(timestamp)) return false;
    return Date.now() - timestamp < VIEW_COOLDOWN_MS;
  } catch {
    return false;
  }
};

export const markViewed = (pasteId: string): void => {
  try {
    localStorage.setItem(`${VIEWED_STORAGE_KEY_PREFIX}${pasteId}`, Date.now().toString());
  } catch {
    // Ignore quota errors
  }
};

export interface UsePasteViewReturn {
  paste: PasteView | null;
  loading: boolean;
  error: string | null;
  shareToken: string | null;
  fetchPaste: (pasteId: string, currentToken?: string | null) => void;
  setPaste: React.Dispatch<React.SetStateAction<PasteView | null>>;
  setShareToken: React.Dispatch<React.SetStateAction<string | null>>;
}

export const usePasteView = (initialPaste: PasteView | null | undefined, initialId: string): UsePasteViewReturn => {
  const [paste, setPaste] = useState<PasteView | null>(initialPaste || null);
  const [loading, setLoading] = useState(!initialPaste);
  const [error, setError] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const fetchPaste = (pasteId: string, currentToken?: string | null) => {
    setLoading(true);
    setError(null);
    const skipCount = hasRecentlyViewed(pasteId);
    const tokenToUse = currentToken !== undefined ? (currentToken || undefined) : (shareToken || undefined);
    const requestId = ++requestSeqRef.current;
    const isCurrentRequest = () => requestId === requestSeqRef.current;

    pasteApi
      .getPaste(pasteId, undefined, skipCount, tokenToUse)
      .then((data) => {
        if (!isCurrentRequest()) return;
        setPaste(data);
        if (data.shareToken) {
          setShareToken(data.shareToken);
        }
        if (!data.passwordRequired && !data.viewOnce) {
          markViewed(pasteId);
        }
      })
      .catch((err: unknown) => {
        if (!isCurrentRequest()) return;
        if (err instanceof ApiError && err.status === 404) {
          setError('This paste does not exist, has expired, or was already consumed.');
        } else if (err instanceof ApiError && err.status === 429) {
          setError('Too many attempts. Try again later.');
        } else {
          setError('Failed to load paste. Please check your connection.');
        }
      })
      .finally(() => {
        if (isCurrentRequest()) setLoading(false);
      });
  };

  return {
    paste,
    loading,
    error,
    shareToken,
    fetchPaste,
    setPaste,
    setShareToken,
  };
};
