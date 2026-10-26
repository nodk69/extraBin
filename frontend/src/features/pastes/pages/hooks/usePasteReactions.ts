import { useState } from 'react';
import { pasteApi } from '../../api/pasteApi';
import { ApiError } from '../../../../lib/api-client/client';

export interface UsePasteReactionsReturn {
  isStarred: boolean;
  starsCount: number;
  userVote: 'UP' | 'DOWN' | null;
  reactionNotice: string | null;
  setIsStarred: React.Dispatch<React.SetStateAction<boolean>>;
  setStarsCount: React.Dispatch<React.SetStateAction<number>>;
  setUserVote: React.Dispatch<React.SetStateAction<'UP' | 'DOWN' | null>>;
  setReactionNotice: React.Dispatch<React.SetStateAction<string | null>>;
  handleStarToggle: (pasteId: string, isAuthenticated: boolean) => Promise<void>;
  handleVote: (pasteId: string, vote: 'UP' | 'DOWN', isAuthenticated: boolean) => Promise<void>;
}

export const usePasteReactions = (initialIsStarred: boolean, initialStarsCount: number): UsePasteReactionsReturn => {
  const [isStarred, setIsStarred] = useState(initialIsStarred);
  const [starsCount, setStarsCount] = useState(initialStarsCount);
  const [userVote, setUserVote] = useState<'UP' | 'DOWN' | null>(null);
  const [reactionNotice, setReactionNotice] = useState<string | null>(null);

  const handleStarToggle = async (pasteId: string, isAuthenticated: boolean) => {
    if (!isAuthenticated) {
      setReactionNotice('Please sign in to star pastes.');
      setTimeout(() => setReactionNotice(null), 3000);
      return;
    }

    try {
      if (isStarred) {
        await pasteApi.unstarPaste(pasteId);
        setIsStarred(false);
        setStarsCount((prev) => Math.max(0, prev - 1));
      } else {
        await pasteApi.starPaste(pasteId);
        setIsStarred(true);
        setStarsCount((prev) => prev + 1);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setReactionNotice(err.detail);
      } else {
        setReactionNotice('Failed to update star status.');
      }
      setTimeout(() => setReactionNotice(null), 3000);
    }
  };

  const handleVote = async (pasteId: string, vote: 'UP' | 'DOWN', isAuthenticated: boolean) => {
    if (!isAuthenticated) {
      setReactionNotice('Please sign in to vote on pastes.');
      setTimeout(() => setReactionNotice(null), 3000);
      return;
    }

    try {
      if (userVote === vote) {
        await pasteApi.removeVote(pasteId);
        setUserVote(null);
      } else {
        await pasteApi.vote(pasteId, vote);
        setUserVote(vote);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setReactionNotice(err.detail);
      } else {
        setReactionNotice('Failed to submit vote.');
      }
      setTimeout(() => setReactionNotice(null), 3000);
    }
  };

  return {
    isStarred,
    starsCount,
    userVote,
    reactionNotice,
    setIsStarred,
    setStarsCount,
    setUserVote,
    setReactionNotice,
    handleStarToggle,
    handleVote,
  };
};
