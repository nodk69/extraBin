import { useState, useRef, useEffect } from 'react';

export interface UsePasteSearchReturn {
  isSearchOpen: boolean;
  searchQuery: string;
  caseSensitive: boolean;
  activeMatchIndex: number;
  searchInputRef: React.RefObject<HTMLInputElement>;
  setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setCaseSensitive: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveMatchIndex: React.Dispatch<React.SetStateAction<number>>;
  goToNextMatch: () => void;
  goToPrevMatch: () => void;
}

export const usePasteSearch = (): UsePasteSearchReturn => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const goToNextMatch = () => {
    setActiveMatchIndex((prev) => prev + 1);
  };

  const goToPrevMatch = () => {
    setActiveMatchIndex((prev) => Math.max(0, prev - 1));
  };

  return {
    isSearchOpen,
    searchQuery,
    caseSensitive,
    activeMatchIndex,
    searchInputRef,
    setIsSearchOpen,
    setSearchQuery,
    setCaseSensitive,
    setActiveMatchIndex,
    goToNextMatch,
    goToPrevMatch,
  };
};
