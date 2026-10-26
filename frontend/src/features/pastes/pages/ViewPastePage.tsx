import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Clock,
  Copy,
  Download,
  Edit3,
  FileText,
  Globe,
  History,
  KeyRound,
  Lock,
  Share2,
  Trash2,
  WrapText,
  AlertTriangle,
  Check,
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Eye,
  Archive,
  Code,
  Link as LinkIcon,
  MoreVertical,
  Star,
  ThumbsUp,
  ThumbsDown,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { Icon } from '../../../components/ui/PaperIcon';
import { Loading } from '../../../components/ui/Loading';
import { NativeSelect } from '../../../components/ui/dropdown';
import { triggerConfetti } from '../../../lib/confetti';
import { pasteApi } from '../api/pasteApi';
import { PasteView, PasteFileItem } from '../types/paste';
import { ApiError } from '../../../lib/api-client/client';
import { EditPasteModal } from '../components/EditPasteModal';
import { RevisionHistoryModal } from '../components/RevisionHistoryModal';
import { RevisionWorkspace } from '../components/RevisionWorkspace';
import { ShareManagementModal } from '../components/ShareManagementModal';
import { PasteRepliesSection } from '../components/PasteRepliesSection';
import { EmbedModal } from '../components/EmbedModal';
import { QrCodeModal } from '../components/QrCodeModal';
import { accountApi, type PasteRevision } from '../../dashboard/api/accountApi';
import { LANGUAGES } from '../components/CreatePasteForm';
import { renderSafeSyntaxHighlight } from '../../../lib/syntax/highlighter';
import { decryptPaste, type DecryptedFile, type EncryptedPasteViewDTO } from '../../../lib/crypto/e2ePaste';
import { detectLanguageFromFilename } from './CreatePastePage';
import {
  buildCanonicalShareUrl,
  buildMarkdownShareLink,
  extractKeyFragment,
  resolvePublicBaseUrl,
} from '../lib/shareUrl';

export interface ViewPastePageProps {
  initialPaste?: PasteView;
  pasteId?: string;
}

export const ViewPastePage: React.FC<ViewPastePageProps> = ({ initialPaste, pasteId: propPasteId }) => {
  const { id: routeId, fileId } = useParams<{ id: string; fileId?: string }>();
  const id = propPasteId || routeId || initialPaste?.id || 'reactPaste1';
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [paste, setPaste] = useState<PasteView | null>(initialPaste || null);
  const [loading, setLoading] = useState(!initialPaste);
  const [error, setError] = useState<string | null>(null);
  const [isFileCopied, setIsFileCopied] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [isShareLinkCopied, setIsShareLinkCopied] = useState(false);
  const [isLineLinkCopied, setIsLineLinkCopied] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [wrapLines, setWrapLines] = useState(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);

  // Single live region for clipboard / download feedback. Only one message is
  // ever shown, so assistive technology announces one outcome at a time.
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isDownloadingFile, setIsDownloadingFile] = useState(false);

  // Reaction Toast Notification (e.g. Sign in to star pastes)
  const [reactionNotice, setReactionNotice] = useState<string | null>(null);

  // Fallback modal for manual copy
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);

  // ZIP download state
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  // Password unlock state
  const [enteredPassword, setEnteredPassword] = useState('');
  const [showEnteredPassword, setShowEnteredPassword] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // End-to-End Encryption state
  const [decryptedFiles, setDecryptedFiles] = useState<DecryptedFile[] | null>(null);
  const [isE2eDecrypting, setIsE2eDecrypting] = useState(false);
  const [e2eDecryptError, setE2eDecryptError] = useState<string | null>(null);
  const [enteredE2eCredential, setEnteredE2eCredential] = useState('');
  const [showEnteredE2eCredential, setShowEnteredE2eCredential] = useState(false);

  // In-paste Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Synchronized scrolling references matching CreatePastePage
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const MAX_GUTTER_LINES = 1000;

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  };

  // Modals state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [deletionCapability, setDeletionCapability] = useState('');
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Inline Revision History & Diff Workspace state
  const [showRevisionWorkspace, setShowRevisionWorkspace] = useState(false);
  const [revisions, setRevisions] = useState<PasteRevision[]>([]);
  const [revisionError, setRevisionError] = useState<string | null>(null);

  // Owner tag management state
  const [pasteTags, setPasteTags] = useState<Array<{ id: number; name: string }>>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const [isTagSubmitting, setIsTagSubmitting] = useState(false);

  const fetchRevisions = (pasteId: string) => {
    setRevisionError(null);
    accountApi
      .getRevisions(pasteId)
      .then((data) => {
        if (isMountedRef.current) {
          setRevisions(data);
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          const msg = err?.response?.data?.detail || err?.message || 'Failed to load revision history';
          setRevisionError(msg);
        }
      });
  };

  // In-editor editing state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [workspaceDraftFiles, setWorkspaceDraftFiles] = useState<PasteFileItem[]>([]);
  const isDirtyRef = useRef(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const overflowMenuPanelRef = useRef<HTMLDivElement>(null);
  const overflowTriggerRef = useRef<HTMLButtonElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const shareMenuPanelRef = useRef<HTMLDivElement>(null);
  const shareTriggerRef = useRef<HTMLButtonElement>(null);
  const overflowOpenRef = useRef(false);
  const shareOpenRef = useRef(false);
  // Index of the focused item inside the open menus, so arrow navigation keeps
  // working even when the browser focus has not settled on an item yet.
  const overflowMenuIndexRef = useRef(0);
  const shareMenuIndexRef = useRef(0);
  // Monotonic request id: a slow response for a paste the user already left
  // must never overwrite the paste that is currently routed.
  const requestSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const VIEWED_STORAGE_KEY_PREFIX = 'extraBin_viewed_';
  const VIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

  const hasRecentlyViewed = (pasteId: string): boolean => {
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

  const markViewed = (pasteId: string): void => {
    try {
      localStorage.setItem(`${VIEWED_STORAGE_KEY_PREFIX}${pasteId}`, Date.now().toString());
    } catch {
      // Ignore quota errors
    }
  };

  const buildViewDTO = (p: PasteView): EncryptedPasteViewDTO => {
    return {
      id: p.id,
      encryptionMode: p.encryptionMode!,
      kdfSalt: p.kdfSalt || '',
      kdfIterations: p.kdfIterations || 600000,
      wrappedKey: p.wrappedKey ?? null,
      burnAfterReading: !!(p.burnAfterReading || p.viewOnce),
      files: (p.files || []).map((f) => ({
        id: f.id,
        filename: f.filename,
        nonce: f.nonce || '',
        ciphertext: f.ciphertext || '',
        authTag: f.authTag || '',
      })),
    };
  };

  const fetchPaste = (pasteId: string, currentToken?: string | null) => {
    setLoading(true);
    setError(null);
    const skipCount = hasRecentlyViewed(pasteId);
    const tokenToUse = currentToken !== undefined ? (currentToken || undefined) : (shareToken || undefined);
    // Every load gets a sequence number; only the newest one may write state.
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

        // Check for E2E auto-decryption if link key is in URL fragment (#key=...)
        if (data.encryptionMode) {
          const hash = window.location.hash;
          let linkKey: string | null = null;
          if (hash.startsWith('#key=')) {
            linkKey = decodeURIComponent(hash.substring(5));
          }
          if (linkKey) {
            setIsE2eDecrypting(true);
            setE2eDecryptError(null);
            decryptPaste(buildViewDTO(data), linkKey)
              .then((decrypted) => {
                setDecryptedFiles(decrypted);
                triggerConfetti();
              })
              .catch((err) => {
                console.error('Auto decrypt error:', err);
                pasteApi.reportDecryptFailed(pasteId);
                setE2eDecryptError("We couldn't decrypt this paste. Possible causes include an incorrect key, an incomplete link, or corrupted encrypted data.");
              })
              .finally(() => {
                setIsE2eDecrypting(false);
              });
          }
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

  const handleManualDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paste || !enteredE2eCredential.trim() || !id) return;
    setIsE2eDecrypting(true);
    setE2eDecryptError(null);
    try {
      const decrypted = await decryptPaste(buildViewDTO(paste), enteredE2eCredential.trim());
      setDecryptedFiles(decrypted);
      if (!paste.viewOnce) {
        markViewed(id);
      }
      triggerConfetti();
    } catch (err) {
      console.error('Manual decrypt error:', err);
      pasteApi.reportDecryptFailed(id);
      setE2eDecryptError('Decryption failed. Incorrect passphrase or key.');
    } finally {
      setIsE2eDecrypting(false);
    }
  };

  const handleUnlockPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !enteredPassword.trim()) return;
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const skipCount = hasRecentlyViewed(id);
      const unlockedPaste = await pasteApi.getPaste(id, enteredPassword.trim(), skipCount, shareToken || undefined);
      setPaste(unlockedPaste);
      if (unlockedPaste.shareToken) {
        setShareToken(unlockedPaste.shareToken);
      }
      if (!unlockedPaste.viewOnce) {
        markViewed(id);
      }
      triggerConfetti();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setUnlockError(err.detail);
      } else {
        setUnlockError('Incorrect password. Please verify and try again.');
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  useEffect(() => {
    if (id) {
      const params = new URLSearchParams(location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        setShareToken(urlToken);
      }
      fetchPaste(id, urlToken);
    }
  }, [id, location.search]);

  // Keep the document title in sync with the paste that is on screen.
  useEffect(() => {
    if (!paste) return;
    document.title = paste.title ? `${paste.title} · extraBin` : 'extraBin';
  }, [paste?.id, paste?.title]);

  useEffect(() => {
    setPasteTags([]);
    setTagError(null);
    setTagInput('');
    if (isAuthenticated && paste?.isOwner && paste.id) {
      pasteApi
        .getPasteTags(paste.id)
        .then(setPasteTags)
        .catch(() => setPasteTags([]));
    }
  }, [paste?.id, paste?.isOwner, isAuthenticated]);

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paste || isTagSubmitting) return;
    const clean = tagInput.trim().toLowerCase();
    if (!clean) return;
    setIsTagSubmitting(true);
    setTagError(null);
    try {
      const created = await pasteApi.addTag(paste.id, clean);
      setPasteTags((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setTagInput('');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setTagError(err.detail);
      } else {
        setTagError('Failed to add tag.');
      }
    } finally {
      setIsTagSubmitting(false);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    if (!paste) return;
    try {
      await pasteApi.removeTag(paste.id, tagId);
      setPasteTags((prev) => prev.filter((t) => t.id !== tagId));
      setTagError(null);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setTagError(err.detail);
      } else {
        setTagError('Failed to remove tag.');
      }
    }
  };

  // Global Escape keydown and outside click handler for modal & overflow dismissal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (manualCopyText !== null) {
          setManualCopyText(null);
        }
        if (overflowOpenRef.current) {
          overflowOpenRef.current = false;
          setShowOverflowMenu(false);
          overflowTriggerRef.current?.focus();
        }
        if (shareOpenRef.current) {
          shareOpenRef.current = false;
          setShowShareMenu(false);
          shareTriggerRef.current?.focus();
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [manualCopyText]);

  useEffect(() => {
    overflowOpenRef.current = showOverflowMenu;
  }, [showOverflowMenu]);

  useEffect(() => {
    shareOpenRef.current = showShareMenu;
  }, [showShareMenu]);

  const files = useMemo<PasteFileItem[]>(() => {
    if (isEditing && workspaceDraftFiles.length > 0) {
      return workspaceDraftFiles;
    }
    if (decryptedFiles && decryptedFiles.length > 0) {
      return decryptedFiles.map((df, idx) => ({
        id: idx + 1,
        filename: df.filename,
        content: df.text ?? new TextDecoder().decode(df.bytes),
        language: detectLanguageFromFilename(df.filename) || paste?.language || 'plaintext',
      }));
    }
    if (paste?.files && paste.files.length > 0) {
      return paste.files;
    }
    if (!paste) return [];
    return [
      {
        filename: 'snippet.txt',
        content: paste.content,
        language: paste.language,
        sortOrder: 0,
        sizeBytes: paste.contentSizeBytes,
        lineCount: paste.lineCount,
      },
    ];
  }, [paste, decryptedFiles, isEditing, workspaceDraftFiles]);

  // Determine active file matching fileId or fallback
  const { activeFile, activeIndex, isFileNotFound } = useMemo(() => {
    if (files.length === 0) {
      return { activeFile: null, activeIndex: 0, isFileNotFound: false };
    }

    if (!fileId) {
      return { activeFile: files[0], activeIndex: 0, isFileNotFound: false };
    }

    // Check if legacy alias 'default'
    if (fileId === 'default') {
      const isLegacySingle = files.length === 1 && files[0].id === undefined;
      if (isLegacySingle) {
        return { activeFile: files[0], activeIndex: 0, isFileNotFound: false };
      } else {
        return { activeFile: null, activeIndex: -1, isFileNotFound: true };
      }
    }

    // Strict numeric database ID lookup
    const foundIdx = files.findIndex((f) => String(f.id) === fileId);
    if (foundIdx !== -1) {
      return { activeFile: files[foundIdx], activeIndex: foundIdx, isFileNotFound: false };
    }

    return { activeFile: null, activeIndex: -1, isFileNotFound: true };
  }, [files, fileId]);

  // Update hash line synchronization
  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash;
      const match = hash.match(/^#L([1-9]\d*)$/);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        const targetContent = activeFile?.content || (files.length > 0 ? files[0]?.content : '') || paste?.content;
        if (targetContent) {
          const totalLines = targetContent.split('\n').length;
          if (lineNum >= 1 && lineNum <= totalLines) {
            setActiveLine(lineNum);
            return;
          }
        }
      }
      setActiveLine(null);
    };

    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [activeFile, files, paste]);

  // Clear line highlight and hash when fileId changes after initial mount
  const prevFileIdRef = useRef<string | undefined>(fileId);
  useEffect(() => {
    if (prevFileIdRef.current !== undefined && prevFileIdRef.current !== fileId) {
      if (window.location.hash) {
        if (window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } else {
          window.location.hash = '';
        }
      }
      setActiveLine(null);
    }
    prevFileIdRef.current = fileId;
  }, [fileId]);

  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0;
  const currentActiveFile = activeFile || {
    filename: 'snippet.txt',
    content: paste?.content || '',
    language: paste?.language || 'plaintext',
    sortOrder: 0,
    sizeBytes: paste?.contentSizeBytes || 0,
    lineCount: paste?.lineCount || 0,
  };

  const isMultiFile = files.length > 1;
  // A view-once paste is destroyed on the server the moment it is read, so the
  // browser is the only place that still holds the bytes.
  const isViewOnceConsumed = Boolean(paste?.viewOnce || paste?.burnAfterReading);
  const rawUrl = id && currentActiveFile
    ? currentActiveFile.id !== undefined
      ? pasteApi.getRawFileByIdUrl(id, currentActiveFile.id, shareToken || undefined)
      : isMultiFile
      ? pasteApi.getRawFileUrl(id, currentActiveFile.filename, shareToken || undefined)
      : pasteApi.getRawUrl(id, shareToken || undefined)
    : '#';

  const downloadUrl = id && currentActiveFile
    ? currentActiveFile.id !== undefined
      ? pasteApi.getDownloadFileByIdUrl(id, currentActiveFile.id, shareToken || undefined)
      : isMultiFile
      ? pasteApi.getDownloadFileUrl(id, currentActiveFile.filename, shareToken || undefined)
      : pasteApi.getDownloadUrl(id, shareToken || undefined)
    : '#';

  const isEmbeddable = !!(
    paste &&
    !paste.passwordProtected &&
    !paste.passwordRequired &&
    !paste.encryptionMode &&
    !paste.viewOnce &&
    !paste.burnAfterReading
  );

  const lines = useMemo(() => {
    return currentActiveFile.content ? currentActiveFile.content.split('\n') : [];
  }, [currentActiveFile.content]);

  // In-paste search occurrences
  const matches = useMemo(() => {
    if (!searchQuery.trim() || !currentActiveFile.content) return [];
    const query = caseSensitive ? searchQuery : searchQuery.toLowerCase();
    const results: { lineIndex: number; start: number; end: number; matchId: number }[] = [];
    let id = 0;
    lines.forEach((line, lineIndex) => {
      const text = caseSensitive ? line : line.toLowerCase();
      let start = 0;
      while ((start = text.indexOf(query, start)) !== -1) {
        results.push({ lineIndex, start, end: start + query.length, matchId: id++ });
        start += query.length;
      }
    });
    return results;
  }, [searchQuery, caseSensitive, lines, currentActiveFile.content]);

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % matches.length;
    setActiveMatchIndex(nextIdx);
    scrollToMatch(nextIdx);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + matches.length) % matches.length;
    setActiveMatchIndex(prevIdx);
    scrollToMatch(prevIdx);
  };

  const scrollToMatch = (matchIdx: number) => {
    if (!matches[matchIdx]) return;
    const lineIdx = matches[matchIdx].lineIndex;
    if (textareaRef.current) {
      textareaRef.current.scrollTop = Math.max(0, lineIdx * 22 - 60);
    }
  };

  // Safe clipboard utility with fallback modal
  const copyToClipboard = async (text: string, onSuccess: () => void) => {
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        onSuccess();
        return;
      } catch (err) {
        // Fall back to modal
      }
    }
    // Never claim success when the clipboard was refused: announce the failure
    // and hand the text over for a manual copy.
    setStatusMessage('Could not copy — your browser blocked the clipboard. Copy the text manually.');
    setManualCopyText(text);
  };

  const announceStatus = (message: string) => {
    setStatusMessage(message);
    setTimeout(() => {
      setStatusMessage((prev) => (prev === message ? null : prev));
    }, 2500);
  };

  /**
   * The canonical share URL of the paste that is on screen.
   *
   * Only four parts may ever appear: the public base, the paste path, the file
   * segment of a selected file, and — for UNLISTED pastes only — the share
   * token. The end-to-end key stays in the fragment, and passwords, unlock
   * tokens and deletion capabilities are never part of a share URL.
   */
  /**
   * The share token of the paste on screen — only for UNLISTED pastes.
   *
   * A public or private paste must never carry a token: a stale `?token=` in
   * the address bar is not a capability of this paste and must not leak into
   * a link that is handed to somebody else.
   */
  const shareTokenForPaste = (): string | null => {
    if (paste?.visibility !== 'UNLISTED') return null;
    if (shareToken) return shareToken;
    if (paste?.shareToken) return paste.shareToken;
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('token') || null;
  };

  const buildShareUrl = (): string => {
    const pasteId = paste?.id || id;
    const sharedFileId = fileId && activeFile && activeFile.id !== undefined ? activeFile.id : null;
    return buildCanonicalShareUrl({
      baseUrl: resolvePublicBaseUrl(),
      pasteId,
      fileId: sharedFileId,
      token: shareTokenForPaste(),
      keyFragment: extractKeyFragment(typeof window !== 'undefined' ? window.location.hash : null),
    });
  };

  const handleCopyShareLink = async () => {
    const url = buildShareUrl();
    setShowShareMenu(false);
    await copyToClipboard(url, () => {
      setIsShareLinkCopied(true);
      setTimeout(() => setIsShareLinkCopied(false), 2000);
    });
  };

  const handleCopyMarkdownLink = async () => {
    const url = buildShareUrl();
    const markdown = buildMarkdownShareLink(paste?.title || paste?.id || 'Paste', url);
    setShowShareMenu(false);
    await copyToClipboard(markdown, () => announceStatus('Markdown URL copied to clipboard.'));
  };

  const handleCopyContent = async () => {
    if (!currentActiveFile) return;
    await copyToClipboard(currentActiveFile.content, () => {
      setIsFileCopied(true);
      setTimeout(() => {
        setIsFileCopied(false);
      }, 2000);
    });
  };

  const handleCopyFileLink = async () => {
    if (!paste || !currentActiveFile) return;
    const targetFileId = currentActiveFile.id !== undefined ? String(currentActiveFile.id) : (isMultiFile ? currentActiveFile.filename : 'default');
    const url = buildCanonicalShareUrl({
      baseUrl: resolvePublicBaseUrl(),
      pasteId: paste.id,
      fileId: targetFileId,
      token: shareTokenForPaste(),
    });
    await copyToClipboard(url, () => {
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    });
  };

  /** Menu keyboard support: arrow / home / end navigation, Escape to close. */
  const focusableMenuItems = (container: HTMLElement | null): HTMLElement[] => {
    if (!container) return [];
    return Array.from(
      container.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
    ).filter((element) => element.tagName !== 'A' || element.hasAttribute('href'));
  };

  const navigateMenu = (
    e: React.KeyboardEvent<HTMLDivElement>,
    panel: HTMLElement | null,
    indexRef: React.MutableRefObject<number>,
    close: () => void,
    trigger: React.RefObject<HTMLButtonElement>
  ) => {
    const items = focusableMenuItems(panel);
    if (items.length === 0) return;

    const activeIndex = items.indexOf(document.activeElement as HTMLElement);
    const currentIndex = activeIndex >= 0 ? activeIndex : Math.min(indexRef.current, items.length - 1);
    let nextIndex = -1;

    switch (e.key) {
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + items.length) % items.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close();
        trigger.current?.focus();
        return;
      default:
        return;
    }

    e.preventDefault();
    indexRef.current = nextIndex;
    items[nextIndex]?.focus();
  };

  const closeOverflowMenu = () => {
    overflowOpenRef.current = false;
    setShowOverflowMenu(false);
  };

  const closeShareMenu = () => {
    shareOpenRef.current = false;
    setShowShareMenu(false);
  };

  // Move focus into the overflow menu as soon as it opens.
  useEffect(() => {
    if (!showOverflowMenu) return;
    const items = focusableMenuItems(overflowMenuPanelRef.current);
    overflowMenuIndexRef.current = 0;
    items[0]?.focus();
  }, [showOverflowMenu]);

  // Move focus into the share menu as soon as it opens.
  useEffect(() => {
    if (!showShareMenu) return;
    const items = focusableMenuItems(shareMenuPanelRef.current);
    shareMenuIndexRef.current = 0;
    items[0]?.focus();
  }, [showShareMenu]);

  const handleCopyLineLink = async () => {
    if (!paste || !currentActiveFile || !activeLine) return;
    const targetFileId = currentActiveFile.id !== undefined ? String(currentActiveFile.id) : (isMultiFile ? currentActiveFile.filename : 'default');
    const url = `${buildCanonicalShareUrl({
      baseUrl: resolvePublicBaseUrl(),
      pasteId: paste.id,
      fileId: targetFileId,
      token: shareTokenForPaste(),
    })}#L${activeLine}`;
    await copyToClipboard(url, () => {
      setIsLineLinkCopied(true);
      setTimeout(() => setIsLineLinkCopied(false), 2000);
    });
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'snippet.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Downloads the active file.
   *
   * Three transports, in order of authority:
   *  - a protected paste is served by the server, because the browser only
   *    ever holds the decrypted view and never the persisted bytes;
   *  - a consumed view-once paste only exists in this browser tab, so the
   *    in-memory bytes are the only copy left;
   *  - an ordinary paste is served by the download endpoint.
   */
  const performDownload = async () => {
    if (!paste || !currentActiveFile) return;
    const fileId = currentActiveFile.id;
    const tokenToUse = shareToken || undefined;

    if (enteredPassword && fileId !== undefined) {
      setIsDownloadingFile(true);
      try {
        const blob = await pasteApi.downloadFile(paste.id, fileId, enteredPassword, tokenToUse);
        triggerBlobDownload(blob, currentActiveFile.filename);
        announceStatus('Download started.');
      } catch (err) {
        console.error('Failed to download file', err);
        announceStatus('Download failed: the server refused to return the file.');
      } finally {
        setIsDownloadingFile(false);
      }
      return;
    }

    if (isViewOnceConsumed && currentActiveFile.content !== undefined) {
      triggerBlobDownload(
        new Blob([currentActiveFile.content], { type: 'text/plain;charset=utf-8' }),
        currentActiveFile.filename
      );
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = currentActiveFile.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleDownload = (e: React.MouseEvent) => {
    if (!paste || !currentActiveFile) return;
    // An ordinary paste is downloaded by the toolbar anchor itself.
    if (!enteredPassword && !isViewOnceConsumed) return;
    e.preventDefault();
    void performDownload();
  };

  const handleDownloadZip = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloadingZip || !id) return;

    setIsDownloadingZip(true);
    setZipError(null);
    try {
      const urlToken = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null;
      const tokenToUse = shareToken || urlToken || undefined;
      const blob = await pasteApi.downloadZip(id, enteredPassword || undefined, tokenToUse);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${paste?.title || id}-bundle.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error('Failed to download zip', err);
      setZipError('Archive generation failed. The paste may have expired or is unavailable.');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  /**
   * Opens the raw bytes of the active file. Mirrors {@link performDownload}:
   * protected pastes are served by the server, consumed view-once pastes come
   * from this browser tab, everything else from the raw endpoint.
   */
  const performRaw = async () => {
    if (!paste || !currentActiveFile) return;
    const fileId = currentActiveFile.id;
    const tokenToUse = shareToken || undefined;

    if (enteredPassword && fileId !== undefined) {
      try {
        const blob = await pasteApi.getRawBlob(paste.id, fileId, enteredPassword, tokenToUse);
        window.open(URL.createObjectURL(blob), '_blank');
      } catch (err) {
        console.error('Failed to open raw content', err);
        announceStatus('Could not open the raw content: the server refused the request.');
      }
      return;
    }

    if (isViewOnceConsumed && currentActiveFile.content !== undefined) {
      const blob = new Blob([currentActiveFile.content], { type: 'text/plain;charset=utf-8' });
      window.open(URL.createObjectURL(blob), '_blank');
      return;
    }

    window.open(rawUrl, '_blank');
  };

  const handleOpenRaw = (e: React.MouseEvent) => {
    if (!paste || !currentActiveFile) return;
    // An ordinary paste is opened by the overflow anchor itself.
    if (!enteredPassword && !isViewOnceConsumed) return;
    e.preventDefault();
    void performRaw();
  };

  const handleCopyApiUrl = async (ext: string) => {
    if (!paste) return;
    const url = `${window.location.origin}/api/v1/pastes/${paste.id}${ext}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedFormat(ext);
      setTimeout(() => setCopiedFormat(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleToggleStar = async () => {
    if (!paste) return;

    if (!user && !isAuthenticated) {
      setReactionNotice('Sign in to star pastes');
      setTimeout(() => setReactionNotice(null), 4000);
      return;
    }

    const previousStarred = !!paste.isStarred;
    const previousStarsCount = paste.starsCount ?? 0;
    const newStarred = !previousStarred;
    const newCount = newStarred ? previousStarsCount + 1 : Math.max(0, previousStarsCount - 1);

    // Optimistic update
    setPaste((prev) => (prev ? { ...prev, isStarred: newStarred, starsCount: newCount } : null));

    try {
      if (newStarred) {
        const res = await pasteApi.starPaste(paste.id);
        setPaste((prev) => (prev ? { ...prev, isStarred: res.isStarred, starsCount: res.starsCount } : null));
      } else {
        const res = await pasteApi.unstarPaste(paste.id);
        setPaste((prev) => (prev ? { ...prev, isStarred: res.isStarred, starsCount: res.starsCount } : null));
      }
    } catch (err) {
      // Rollback
      setPaste((prev) => (prev ? { ...prev, isStarred: previousStarred, starsCount: previousStarsCount } : null));
    }
  };

  const handleVotePaste = async (voteType: 'UP' | 'DOWN') => {
    if (!paste || paste.viewOnce || paste.burnAfterReading) return;

    const previousVote = paste.userVote;
    const previousUp = paste.upvotes ?? 0;
    const previousDown = paste.downvotes ?? 0;
    const isRetract = previousVote === voteType;

    // Optimistic update
    let nextUp = previousUp;
    let nextDown = previousDown;
    if (isRetract) {
      if (voteType === 'UP') nextUp = Math.max(0, nextUp - 1);
      if (voteType === 'DOWN') nextDown = Math.max(0, nextDown - 1);
    } else {
      if (voteType === 'UP') {
        nextUp = nextUp + 1;
        if (previousVote === 'DOWN') nextDown = Math.max(0, nextDown - 1);
      } else {
        nextDown = nextDown + 1;
        if (previousVote === 'UP') nextUp = Math.max(0, nextUp - 1);
      }
    }

    setPaste((prev) =>
      prev
        ? {
            ...prev,
            userVote: isRetract ? undefined : voteType,
            upvotes: nextUp,
            downvotes: nextDown,
          }
        : null
    );

    try {
      if (isRetract) {
        const res = await pasteApi.retractPasteVote(paste.id);
        setPaste((prev) => (prev ? { ...prev, ...res } : null));
      } else {
        const res = await pasteApi.votePaste(paste.id, voteType);
        setPaste((prev) => (prev ? { ...prev, ...res } : null));
      }
    } catch (err) {
      // Rollback
      setPaste((prev) =>
        prev
          ? {
              ...prev,
              userVote: previousVote,
              upvotes: previousUp,
              downvotes: previousDown,
            }
          : null
      );
    }
  };

  const handleDeleteAnonymous = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !deletionCapability.trim()) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await pasteApi.deleteAnonymousPaste(id, deletionCapability.trim());
      window.location.href = '/?deleted=true';
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setDeleteError(err.detail);
      } else {
        setDeleteError('Failed to delete paste. Verify your capability secret.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartEditing = () => {
    if (!paste) return;
    setEditError(null);
    isDirtyRef.current = false;
    // Snapshot the current files array into workspaceDraftFiles
    setWorkspaceDraftFiles(files.map(f => ({ ...f })));
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    if (!isDirtyRef.current) {
      setIsEditing(false);
      setEditError(null);
      setWorkspaceDraftFiles([]);
      return;
    }
    setShowDiscardConfirm(true);
  };

  const handleConfirmDiscard = () => {
    setIsEditing(false);
    setShowDiscardConfirm(false);
    setEditError(null);
    isDirtyRef.current = false;
    setWorkspaceDraftFiles([]);
  };

  const handleContentChange = (newContent: string) => {
    isDirtyRef.current = true;
    setWorkspaceDraftFiles((prev) => {
      const copy = [...prev];
      if (copy[safeActiveIndex]) {
        copy[safeActiveIndex] = { ...copy[safeActiveIndex], content: newContent };
      }
      return copy;
    });
  };

  const handleFilenameChange = (newFilename: string) => {
    isDirtyRef.current = true;
    setWorkspaceDraftFiles((prev) => {
      const copy = [...prev];
      if (copy[safeActiveIndex]) {
        copy[safeActiveIndex] = { ...copy[safeActiveIndex], filename: newFilename };
      }
      return copy;
    });
  };

  const handleLanguageChange = (newLang: string) => {
    isDirtyRef.current = true;
    setWorkspaceDraftFiles((prev) => {
      const copy = [...prev];
      if (copy[safeActiveIndex]) {
        copy[safeActiveIndex] = { ...copy[safeActiveIndex], language: newLang };
      }
      return copy;
    });
  };

  const handleSaveEditing = async () => {
    if (!paste || isSaving) return;
    setIsSaving(true);
    setEditError(null);

    const isMulti = workspaceDraftFiles.length > 1 || (paste.files && paste.files.length > 1);

    const payload: Parameters<typeof accountApi.editPaste>[1] = {
      title: paste.title,
      visibility: paste.visibility,
      version: paste.version,
    };

    if (isMulti) {
      payload.files = workspaceDraftFiles.map((f) => ({
        id: f.id,
        filename: f.filename,
        content: f.content,
        language: f.language,
      }));
    } else {
      const primaryFile = workspaceDraftFiles[0] || currentActiveFile;
      payload.content = primaryFile.content;
      payload.language = primaryFile.language;
      payload.files = [
        {
          id: primaryFile.id,
          filename: primaryFile.filename,
          content: primaryFile.content,
          language: primaryFile.language,
        },
      ];
    }

    try {
      const updated = await accountApi.editPaste(paste.id, payload);
      if (isMountedRef.current) {
        setPaste(updated as unknown as PasteView);
        setIsEditing(false);
        isDirtyRef.current = false;
        setWorkspaceDraftFiles([]);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (err instanceof ApiError) {
        setEditError(err.detail);
      } else if (err && typeof err === 'object' && 'detail' in err) {
        setEditError(String((err as any).detail));
      } else {
        setEditError('Failed to save changes. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  const renderLineContent = (lineText: string, lineIndex: number) => {
    const activeLang = currentActiveFile.language || paste?.language || 'plaintext';
    if (!lineText) {
      return '\u00A0';
    }

    // If active search query, highlight matching occurrences
    if (searchQuery.trim()) {
      const q = caseSensitive ? searchQuery : searchQuery.toLowerCase();
      const text = caseSensitive ? lineText : lineText.toLowerCase();
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let matchPos = 0;

      while ((matchPos = text.indexOf(q, lastIndex)) !== -1) {
        // Text before match
        if (matchPos > lastIndex) {
          parts.push(renderSafeSyntaxHighlight(lineText.substring(lastIndex, matchPos), activeLang));
        }

        const isCurrentMatch = matches[activeMatchIndex] &&
          matches[activeMatchIndex].lineIndex === lineIndex &&
          matches[activeMatchIndex].start === matchPos;

        parts.push(
          <mark
            key={`match-${lineIndex}-${matchPos}`}
            className={`search-match px-0.5 rounded ${
              isCurrentMatch ? 'bg-[#c6f05b] text-[#17201d] font-bold shadow-sm' : 'bg-[#fef08a] text-[#17201d]'
            }`}
          >
            {lineText.substring(matchPos, matchPos + q.length)}
          </mark>
        );

        lastIndex = matchPos + q.length;
      }

      if (lastIndex < lineText.length) {
        parts.push(renderSafeSyntaxHighlight(lineText.substring(lastIndex), activeLang));
      }

      return <>{parts}</>;
    }

    return renderSafeSyntaxHighlight(lineText, activeLang);
  };

  // 1. Loading State
  if (loading) {
    return <Loading message="Fetching paste contents..." />;
  }

  // 2. Error State / Expired / 404
  if (error || !paste) {
    return (
      <div className="workspace max-w-xl mx-auto py-16 text-center">
        <div className="paper-card p-8 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#ffb3a5] text-[#17201d] mx-auto flex items-center justify-center font-bold">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-[#17201d]">Paste Unavailable</h2>
          <p className="text-sm text-[#74776f] font-mono leading-relaxed">
            {error || 'The requested snippet has expired, was destroyed (View Once), or does not exist.'}
          </p>
          <div className="pt-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#ff5c3d] text-[#17201d] font-bold text-xs shadow-[3px_3px_0_#17201d] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all no-underline"
            >
              <Icon name="plus" size={15} />
              <span>Create New Paste</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Password Unlock Gate
  if (paste.passwordRequired) {
    const isViewOnce = paste.viewOnce || paste.burnAfterReading;
    return (
      <div className="workspace max-w-md mx-auto py-16">
        <div className="paper-card p-8 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto bg-[#c6f05b] border border-[#17201d] rounded-xl shadow-[3px_3px_0px_#17201d] flex items-center justify-center">
              <Lock className="w-6 h-6 text-[#17201d]" />
            </div>
            <h2 className="text-2xl font-bold text-[#17201d]">Protected Paste</h2>
            <p className="text-xs text-[#74776f] font-mono">
              {paste.title ? `"${paste.title}"` : 'This paste'} is locked with a secret passcode.
            </p>
          </div>

          {isViewOnce && (
            <div className="p-3 bg-[#ffb3a5]/50 border border-[#ff5c3d] rounded-lg text-xs font-mono text-[#17201d] flex items-start gap-2">
              <Eye className="w-4 h-4 text-[#ff5c3d] shrink-0 mt-0.5" />
              <div>
                <strong>[VIEW ONCE ACTIVE]</strong>
                <p className="mt-0.5 opacity-90">
                  Unlocking this paste will immediately destroy it from the server.
                </p>
              </div>
            </div>
          )}

          {unlockError && (
            <div className="p-3 bg-red-100 border border-red-800 text-red-900 rounded-lg text-xs font-mono font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{unlockError}</span>
            </div>
          )}

          <form onSubmit={handleUnlockPassword} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-mono font-bold uppercase tracking-wider text-[#74776f]">
                  Passcode
                </label>
                {enteredPassword && (
                  <button
                    type="button"
                    onClick={() => setShowEnteredPassword(!showEnteredPassword)}
                    className="text-[11px] font-mono text-[#74776f] hover:text-[#17201d] underline"
                  >
                    {showEnteredPassword ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>
              <input
                type={showEnteredPassword ? 'text' : 'password'}
                value={enteredPassword}
                onChange={(e) => setEnteredPassword(e.target.value)}
                placeholder="Enter unlock passcode..."
                required
                autoFocus
                className="w-full px-3.5 py-2.5 bg-white border border-[#aaa89f] rounded-lg text-sm text-[#17201d] outline-none focus:border-[#17201d]"
              />
            </div>

            <button
              type="submit"
              disabled={isUnlocking || !enteredPassword.trim()}
              className="create-button-full !h-12 !text-xs justify-center gap-2"
            >
              <span>{isUnlocking ? 'Decrypting...' : 'Unlock Paste'}</span>
              <Icon name="arrow" size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 3.5 End-to-End Decryption Gate
  if (paste.encryptionMode && !decryptedFiles) {
    const isViewOnce = paste.viewOnce || paste.burnAfterReading;
    const isAuthor = Boolean(paste.isOwner);

    return (
      <div className="workspace max-w-md mx-auto py-16">
        <div className="paper-card p-8 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto bg-[#dcfce7] border border-[#16a34a] rounded-xl shadow-[3px_3px_0px_#16a34a] flex items-center justify-center">
              <Lock className="w-6 h-6 text-[#166534]" />
            </div>
            <h2 className="text-2xl font-bold text-[#17201d]">End-to-End Encrypted</h2>
            {isAuthor ? (
              <div className="p-3 bg-[#e0f2fe] border border-[#0284c7] rounded-lg text-xs font-mono text-[#0369a1] text-left">
                <strong>You own this paste, but its decryption key isn't available in this session.</strong>
                <p className="mt-1 text-[11px] text-[#0c4a6e]">
                  Your account can establish ownership, but ownership alone cannot recover the encryption key. Enter the key or passphrase below to decrypt and edit.
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#74776f] font-mono">
                This paste is encrypted end-to-end. The link you opened does not include the decryption key. Ask the person who shared it for the encrypted access link or the separately shared key.
              </p>
            )}
          </div>

          {isViewOnce && (
            <div className="p-3 bg-[#ffb3a5]/50 border border-[#ff5c3d] rounded-lg text-xs font-mono text-[#17201d] flex items-start gap-2">
              <Eye className="w-4 h-4 text-[#ff5c3d] shrink-0 mt-0.5" />
              <div>
                <strong>[VIEW ONCE ACTIVE]</strong>
                <p className="mt-0.5 opacity-90">
                  This paste is set to burn after reading.
                </p>
              </div>
            </div>
          )}

          {e2eDecryptError && (
            <div className="p-3 bg-red-100 border border-red-800 text-red-900 rounded-lg text-xs font-mono font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{e2eDecryptError}</span>
            </div>
          )}

          <form onSubmit={handleManualDecrypt} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-mono font-bold uppercase tracking-wider text-[#74776f]">
                  {paste.encryptionMode === 'PASSPHRASE' ? 'Passphrase' : 'Link Key or Passphrase'}
                </label>
                {enteredE2eCredential && (
                  <button
                    type="button"
                    onClick={() => setShowEnteredE2eCredential(!showEnteredE2eCredential)}
                    className="text-[11px] font-mono text-[#74776f] hover:text-[#17201d] underline"
                  >
                    {showEnteredE2eCredential ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>
              <input
                type={showEnteredE2eCredential ? 'text' : 'password'}
                value={enteredE2eCredential}
                onChange={(e) => setEnteredE2eCredential(e.target.value)}
                placeholder={paste.encryptionMode === 'PASSPHRASE' ? 'Enter unlock passphrase...' : 'Enter passphrase or #key...'}
                required
                autoFocus
                className="w-full px-3.5 py-2.5 bg-white border border-[#aaa89f] rounded-lg text-sm text-[#17201d] outline-none focus:border-[#17201d]"
              />
            </div>

            <button
              type="submit"
              disabled={isE2eDecrypting || !enteredE2eCredential.trim()}
              className="create-button-full !h-12 !text-xs justify-center gap-2 !bg-[#16a34a] hover:!bg-[#15803d]"
            >
              <span>{isE2eDecrypting ? 'Decrypting...' : 'Decrypt Paste'}</span>
              <Icon name="arrow" size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 4. Normal Viewing Surface
  const fromTab = (location.state as { fromTab?: 'explore' | 'trending' | 'most-saved' } | null)?.fromTab;
  const backTarget = fromTab && fromTab !== 'explore' ? `/explore?tab=${fromTab}` : '/explore';
  const backLabel =
    fromTab === 'trending'
      ? 'Back to Trending'
      : fromTab === 'most-saved'
        ? 'Back to Most saved'
        : 'Back to Explore';

  const handleBackNavigation = () => {
    if (window.history.length > 1 && fromTab) {
      navigate(-1);
    } else {
      navigate(backTarget);
    }
  };

  return (
    <div className="workspace">
      {/* Back button navigation */}
      <div className="mb-4">
        <button
          type="button"
          onClick={handleBackNavigation}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold text-[#555a53] hover:text-[#17201d] bg-[#eeece6] hover:bg-[#e4e1d8] border border-[#d8d4ca] rounded-md transition-all shadow-sm"
          aria-label={backLabel}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{backLabel}</span>
        </button>
      </div>

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 mb-5 border-b border-[#d8d4ca]">
        <div className="space-y-2">
          <div className="eyebrow">
            <span></span> SHARED RECORD
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#17201d] tracking-tight m-0 break-words">
              {paste.title || 'Untitled Paste'}
            </h1>

            <span className="paper-badge">{paste.language}</span>

            {paste.encryptionMode && (
              <span className="paper-badge bg-[#dcfce7] border-[#16a34a] text-[#166534]">
                <Lock className="w-3 h-3 mr-0.5" /> End-to-End Encrypted
              </span>
            )}

            {paste.visibility === 'PUBLIC' && (
              <span className="paper-badge highlight">
                <Globe className="w-3 h-3 mr-0.5" /> Public
              </span>
            )}
            {paste.visibility === 'UNLISTED' && (
              <span className="paper-badge blue">
                <Share2 className="w-3 h-3 mr-0.5" /> Unlisted
              </span>
            )}
            {paste.visibility === 'PRIVATE' && (
              <span className="paper-badge coral">
                <Lock className="w-3 h-3 mr-0.5" /> Private
              </span>
            )}

            {(paste.viewOnce || paste.burnAfterReading) && (
              <span className="paper-badge coral animate-pulse">
                <Eye className="w-3 h-3 mr-0.5" /> View Once
              </span>
            )}

            {paste.passwordProtected && (
              <span className="paper-badge highlight">
                <Lock className="w-3 h-3 mr-0.5" /> Passcode Protected
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#74776f]">
            <span>
              ID: <code className="text-[#17201d] font-bold">{paste.id}</code>
            </span>
            <span>•</span>
            <span>{files.length} {files.length === 1 ? 'file' : 'files'}</span>
            <span>•</span>
            <span>{(paste.contentSizeBytes / 1024).toFixed(1)} KB</span>
            <span>•</span>
            <span>{paste.lineCount} total lines</span>
            <span>•</span>
            <span>Created {new Date(paste.createdAt).toLocaleDateString()}</span>
            <span>•</span>
            <span className="flex items-center gap-1 font-semibold text-[#17201d]">
              <Eye className="w-3.5 h-3.5 text-[#74776f]" />
              <span>{(paste.views ?? 0).toLocaleString()} {(paste.views ?? 0) === 1 ? 'view' : 'views'}</span>
            </span>
            {paste.expiresAt && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-[#ff5c3d] font-semibold">
                  <Clock className="w-3 h-3" />
                  <span>Expires {new Date(paste.expiresAt).toLocaleDateString()}</span>
                </span>
              </>
            )}
          </div>

          {/* Visibility Explanation */}
          <div className="text-xs text-[#555a53] font-mono">
            {paste.visibility === 'PUBLIC' && (
              <span>Public paste: discoverable by the community in live feeds and search.</span>
            )}
            {paste.visibility === 'UNLISTED' && (
              <span>Unlisted paste: hidden from discovery; accessible only to anyone with the link.</span>
            )}
            {paste.visibility === 'PRIVATE' && (
              <span>Private paste: restricted strictly to your account; only you can view this.</span>
            )}
          </div>
          {/* Single live region for clipboard / download feedback */}
          {statusMessage && (
            <div
              role="status"
              aria-live="polite"
              className="text-xs font-mono font-semibold text-[#17201d]"
            >
              {statusMessage}
            </div>
          )}
          {/* Reaction Notice / Toast */}
          {reactionNotice && (
            <div
              role="alert"
              className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono animate-in fade-in"
            >
              {reactionNotice}
            </div>
          )}
        </div>

        {/* Action Buttons Toolbar with Primary Controls & Accessible Overflow Menu */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Reaction Pill: Upvotes / Downvotes */}
          <div
            className={`inline-flex items-center rounded-lg border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono overflow-hidden ${
              paste.viewOnce || paste.burnAfterReading ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            title={
              paste.viewOnce || paste.burnAfterReading
                ? 'Voting is disabled on view-once pastes'
                : 'Vote on this paste'
            }
          >
            <button
              type="button"
              data-testid="paste-upvote-btn"
              disabled={!!(paste.viewOnce || paste.burnAfterReading)}
              onClick={() => handleVotePaste('UP')}
              aria-label="Upvote this paste"
              className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors hover:bg-[#ebe7dc] disabled:pointer-events-none ${
                paste.userVote === 'UP' ? 'bg-[#c6f05b] text-[#17201d] font-bold' : 'text-[#555a53]'
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              <span data-testid="paste-upvotes-count">{paste.upvotes ?? 0}</span>
            </button>

            <div className="w-[1px] h-4 bg-[#d5d0c5]"></div>

            <button
              type="button"
              data-testid="paste-downvote-btn"
              disabled={!!(paste.viewOnce || paste.burnAfterReading)}
              onClick={() => handleVotePaste('DOWN')}
              aria-label="Downvote this paste"
              className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors hover:bg-[#ebe7dc] disabled:pointer-events-none ${
                paste.userVote === 'DOWN' ? 'bg-[#fed7aa] text-[#17201d] font-bold' : 'text-[#555a53]'
              }`}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
              <span data-testid="paste-downvotes-count">{paste.downvotes ?? 0}</span>
            </button>
          </div>

          {/* Star Button */}
          <button
            type="button"
            onClick={handleToggleStar}
            disabled={!!(paste.viewOnce || paste.burnAfterReading)}
            className={`action-btn ${
              paste.isStarred ? '!bg-amber-100 !border-amber-400 !text-amber-900 font-bold' : ''
            } ${paste.viewOnce || paste.burnAfterReading ? 'opacity-60 cursor-not-allowed' : ''}`}
            aria-label={paste.isStarred ? 'Unstar this paste' : 'Star this paste'}
            title={
              paste.viewOnce || paste.burnAfterReading
                ? 'Starring is disabled on view-once pastes'
                : paste.isStarred
                ? 'Unstar this paste'
                : 'Star this paste'
            }
          >
            <Star
              className={`w-3.5 h-3.5 ${
                paste.isStarred ? 'text-amber-500 fill-amber-500' : 'text-[#74776f]'
              }`}
            />
            <span data-testid="paste-stars-count">{paste.starsCount ?? 0}</span>
          </button>
          {/* Primary sharing action: copies the canonical share URL */}
          <button
            type="button"
            className="action-btn action-btn-primary"
            onClick={handleCopyShareLink}
            aria-label="Copy link"
            title="Copy the canonical link to this paste"
          >
            {isShareLinkCopied ? <Check className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
            <span>{isShareLinkCopied ? 'Copied' : 'Copy link'}</span>
          </button>

          {/* Share menu: every way to hand this paste on */}
          <div className="relative" ref={shareMenuRef}>
            <button
              type="button"
              ref={shareTriggerRef}
              className={`action-btn ${showShareMenu ? 'border-[#17201d] bg-[#faf8f2]' : ''}`}
              onClick={() => setShowShareMenu(!showShareMenu)}
              aria-label="Share"
              aria-haspopup="true"
              aria-expanded={showShareMenu}
              title="Share this paste"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            {showShareMenu && (
              <div
                role="menu"
                aria-label="Share options"
                ref={shareMenuPanelRef}
                onKeyDown={(e) =>
                  navigateMenu(e, shareMenuPanelRef.current, shareMenuIndexRef, closeShareMenu, shareTriggerRef)
                }
                className="absolute right-0 top-full mt-1.5 w-60 rounded-xl border border-[#17201d] bg-[#faf8f2] shadow-[4px_4px_0_#d5d0c5] py-1.5 z-50 font-mono text-xs text-[#17201d]"
              >
                {paste.visibility === 'PRIVATE' ? (
                  <p className="px-3 py-2 text-[#555a53] leading-relaxed">
                    Private paste: there is no public link. Only you can open this paste.
                  </p>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeShareMenu();
                      void handleCopyShareLink();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left"
                  >
                    <LinkIcon className="w-3.5 h-3.5 text-[#74776f]" />
                    <span>Copy share link</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeShareMenu();
                    void performRaw();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-[#74776f]" />
                  <span>Raw {currentActiveFile.filename}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeShareMenu();
                    void performDownload();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left"
                >
                  <Download className="w-3.5 h-3.5 text-[#74776f]" />
                  <span>Download {currentActiveFile.filename}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeShareMenu();
                    void handleCopyMarkdownLink();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left"
                >
                  <Code className="w-3.5 h-3.5 text-[#74776f]" />
                  <span>Markdown link</span>
                </button>
              </div>
            )}
          </div>

          {/* 1. Primary Copy File Content Button */}
          <button
            type="button"
            className="action-btn action-btn-primary"
            onClick={handleCopyContent}
            title={isMultiFile ? `Copy ${currentActiveFile.filename}` : 'Copy Code'}
          >
            {isFileCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{isFileCopied ? 'Copied!' : isMultiFile ? `Copy ${currentActiveFile.filename}` : 'Copy Code'}</span>
          </button>

          {/* Copy File Link Button */}
          {isMultiFile && (
            <button
              type="button"
              className="action-btn"
              onClick={handleCopyFileLink}
              title="Copy link directly to active file"
            >
              {isLinkCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{isLinkCopied ? 'Link Copied!' : 'Copy file link'}</span>
            </button>
          )}

          {/* Copy Line Link Button */}
          {activeLine && (
            <button
              type="button"
              className="action-btn !bg-[#c6f05b] !text-[#17201d] font-bold"
              onClick={handleCopyLineLink}
              title={`Copy link to line ${activeLine}`}
            >
              {isLineLinkCopied ? <Check className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
              <span>{isLineLinkCopied ? 'Line Link Copied!' : `Copy link to line ${activeLine}`}</span>
            </button>
          )}

          {/* 2. Find in File Button */}
          <button
            type="button"
            className={`action-btn ${isSearchOpen ? 'border-[#17201d] bg-[#faf8f2]' : ''}`}
            onClick={() => {
              setIsSearchOpen(!isSearchOpen);
              if (!isSearchOpen) {
                setTimeout(() => searchInputRef.current?.focus(), 50);
              }
            }}
            title="Search inside active file (Ctrl + F)"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Find</span>
          </button>

          {/* 3. Primary Edit Button for owners */}
          {paste.isOwner && (
            <button
              type="button"
              className={`action-btn ${isEditing ? 'border-[#17201d] bg-[#faf8f2]' : ''}`}
              onClick={handleStartEditing}
              title="Edit paste inline"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          )}

          {/* 4. Download Active File */}
          {(enteredPassword || paste.burnAfterReading || paste.viewOnce) ? (
            <button
              type="button"
              className="action-btn"
              onClick={handleDownload}
              disabled={isDownloadingFile}
              title={
                isViewOnceConsumed
                  ? 'Download the in-memory copy — the server copy of this view-once paste was already consumed'
                  : isMultiFile
                  ? `Download ${currentActiveFile.filename}`
                  : 'Download file'
              }
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isMultiFile ? `Download ${currentActiveFile.filename}` : 'Download file'}</span>
            </button>
          ) : (
            <a
              href={downloadUrl}
              download={currentActiveFile.filename}
              className="action-btn"
              onClick={handleDownload}
              title={isMultiFile ? `Download ${currentActiveFile.filename}` : 'Download file'}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isMultiFile ? `Download ${currentActiveFile.filename}` : 'Download file'}</span>
            </a>
          )}
          {isViewOnceConsumed && (
            <span className="text-[11px] font-mono text-[#74776f] leading-relaxed">
              Server download unavailable — this view-once paste was already consumed; only the copy held in
              this browser can be downloaded.
            </span>
          )}

          {/* 5. Download ZIP (for multi-file pastes) */}
          {isMultiFile && (
            (paste.viewOnce || paste.burnAfterReading) ? (
              <span
                className="action-btn opacity-60 cursor-not-allowed text-xs text-[#74776f]"
                title="Server ZIP download is unavailable because this view-once record has already been consumed."
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Server ZIP unavailable for view-once</span>
              </span>
            ) : (
              <button
                type="button"
                className="action-btn"
                onClick={handleDownloadZip}
                disabled={isDownloadingZip}
                title="Download all files as ZIP archive"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{isDownloadingZip ? 'Archiving...' : 'Download ZIP'}</span>
              </button>
            )
          )}

          {/* 6. More Actions Overflow Dropdown Menu */}
          <div className="relative" ref={overflowMenuRef}>
            <button
              type="button"
              ref={overflowTriggerRef}
              className={`action-btn ${showOverflowMenu ? 'border-[#17201d] bg-[#faf8f2]' : ''}`}
              onClick={() => setShowOverflowMenu(!showOverflowMenu)}
              aria-label="More actions"
              aria-haspopup="true"
              aria-expanded={showOverflowMenu}
              title="More actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
              <span>More</span>
            </button>

            {showOverflowMenu && (
              <div
                role="menu"
                aria-label="Secondary actions"
                ref={overflowMenuPanelRef}
                onKeyDown={(e) =>
                  navigateMenu(e, overflowMenuPanelRef.current, overflowMenuIndexRef, closeOverflowMenu, overflowTriggerRef)
                }
                className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-[#17201d] bg-[#faf8f2] shadow-[4px_4px_0_#d5d0c5] py-1.5 z-50 font-mono text-xs text-[#17201d]"
              >
                {/* Wrap Lines Option */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setWrapLines(!wrapLines);
                    setShowOverflowMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left"
                >
                  <WrapText className="w-3.5 h-3.5 text-[#74776f]" />
                  <span>{wrapLines ? 'Unwrap lines' : 'Wrap lines'}</span>
                </button>

                {/* Raw File Option */}
                <a
                  href={rawUrl}
                  role="menuitem"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    handleOpenRaw(e);
                    setShowOverflowMenu(false);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-inherit no-underline"
                >
                  <FileText className="w-3.5 h-3.5 text-[#74776f]" />
                  <span>Raw {currentActiveFile.filename}</span>
                </a>

                {/* Embed Option */}
                {isEmbeddable && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowEmbedModal(true);
                      setShowOverflowMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left"
                  >
                    <Code className="w-3.5 h-3.5 text-[#74776f]" />
                    <span>Embed Snippet</span>
                  </button>
                )}

                {/* QR Code Option */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowQrModal(true);
                    setShowOverflowMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left"
                >
                  <Icon name="qr" size={13} />
                  <span>QR Code</span>
                </button>

                {/* ZIP Download Option */}
                {isMultiFile && (
                  (paste.viewOnce || paste.burnAfterReading) ? (
                    <div
                      role="menuitem"
                      aria-disabled="true"
                      className="px-3 py-2 text-[#74776f] opacity-60 cursor-not-allowed flex items-center gap-2.5"
                    >
                      <Archive className="w-3.5 h-3.5 text-[#74776f]" />
                      <span>ZIP unavailable (View Once)</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={isDownloadingZip}
                      onClick={(e) => {
                        handleDownloadZip(e);
                        setShowOverflowMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left disabled:opacity-50"
                    >
                      <Archive className="w-3.5 h-3.5 text-[#74776f]" />
                      <span>{isDownloadingZip ? 'Archiving...' : 'Download ZIP Archive'}</span>
                    </button>
                  )
                )}

                {/* Owner Actions in Dropdown */}
                {paste.isOwner && (
                  <>
                    <div className="my-1 border-t border-[#d5d0c5]"></div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        handleStartEditing();
                        setShowOverflowMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#74776f]" />
                      <span>Edit Paste</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowRevisionWorkspace(true);
                        setShowOverflowMenu(false);
                        fetchRevisions(paste.id);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left"
                    >
                      <History className="w-3.5 h-3.5 text-[#74776f]" />
                      <span>Revision History</span>
                    </button>
                  </>
                )}

                {/* Unlisted Share Manager */}
                {paste.visibility === 'UNLISTED' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowShareModal(true);
                      setShowOverflowMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#ebe7dc] transition-colors text-left"
                  >
                    <Share2 className="w-3.5 h-3.5 text-[#74776f]" />
                    <span>Manage Share Link</span>
                  </button>
                )}

                {/* Anonymous Delete in Dropdown */}
                {!paste.isOwner && (
                  <>
                    <div className="my-1 border-t border-[#d5d0c5]"></div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowDeleteModal(true);
                        setShowOverflowMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#fee2e2] text-[#b91c1c] transition-colors text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[#b91c1c]" />
                      <span>Delete Paste</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Owner Tag Management Strip */}
      {paste.isOwner && isAuthenticated && (
        <div className="mb-4 p-3 rounded-xl border border-[#d5d0c5] bg-[#faf8f2] flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#17201d]">
            <Icon name="tag" size={13} className="text-[#ff5c3d]" />
            Tags:
          </span>
          {pasteTags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#c6f05b] border border-[#17201d] text-[11px] font-mono font-bold text-[#17201d]"
            >
              #{t.name}
              <button
                type="button"
                onClick={() => handleRemoveTag(t.id)}
                aria-label={`Remove tag ${t.name}`}
                className="hover:text-[#ff5c3d] font-bold"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <form onSubmit={handleAddTag} className="inline-flex items-center gap-1.5">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="add-tag"
              maxLength={50}
              aria-label="New tag name"
              className="w-28 px-2 py-1 bg-white border border-[#d5d0c5] rounded-lg text-[11px] font-mono text-[#17201d] outline-none focus:border-[#17201d]"
            />
            <button
              type="submit"
              disabled={isTagSubmitting || !tagInput.trim()}
              className="px-2 py-1 rounded-lg bg-[#ff5c3d] text-[#17201d] border border-[#17201d] text-[11px] font-mono font-bold shadow-[1px_1px_0px_#17201d] hover:translate-x-[-1px] transition-all disabled:opacity-40"
            >
              Add
            </button>
          </form>
          {tagError && (
            <span role="alert" className="text-[11px] font-mono font-semibold text-[#dc2626]">
              {tagError}
            </span>
          )}
        </div>
      )}

      {/* Fetch as API strip for plaintext pastes */}
      {paste && !paste.encryptionMode && (!paste.visibility || paste.visibility !== 'PRIVATE' || paste.isOwner) && (
        <div className="mb-4 p-2.5 rounded-xl border border-[#d5d0c5] bg-[#faf8f2] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#17201d]">Fetch as:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['.json', '.yaml', '.md', '.txt', '.csv', '.xml'] as const).map((ext) => (
                <button
                  key={ext}
                  type="button"
                  onClick={() => handleCopyApiUrl(ext)}
                  className="px-2 py-0.5 rounded-md bg-[#ebe7dc] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-[#17201d] transition-colors cursor-pointer"
                  title={`Copy GET /api/v1/pastes/${paste.id}${ext}`}
                >
                  {copiedFormat === ext ? 'Copied!' : ext}
                </button>
              ))}
            </div>
          </div>
          <Link
            to="/docs"
            className="text-[11px] text-[#74786f] hover:text-[#17201d] underline ml-auto"
          >
            API docs
          </Link>
        </div>
      )}

      {/* View Once Alert Banner */}
      {(paste.viewOnce || paste.burnAfterReading) && (
        <div className="mb-5 p-4 rounded-xl border-2 border-[#ff5c3d] bg-[#faf8f2] shadow-[4px_4px_0_#ff5c3d] flex items-start gap-3">
          <Eye className="w-5 h-5 text-[#ff5c3d] shrink-0 mt-0.5 animate-pulse" />
          <div className="text-xs font-mono leading-relaxed text-[#17201d]">
            <strong className="text-[#ff5c3d] block text-sm mb-0.5 uppercase tracking-wide">
              🔥 View Once Notice
            </strong>
            This paste was configured to be viewed only once and has now been permanently purged from
            the server. If you leave or reload this page, its contents will be lost forever.
          </div>
        </div>
      )}

      {/* In-Paste Search Toolbar */}
      {isSearchOpen && (
        <div className="mb-3 p-3 rounded-xl border border-[#17201d] bg-[#faf8f2] shadow-[3px_3px_0_#d5d0c5] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-[#74776f]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Find in active file... (Esc to close)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setActiveMatchIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsSearchOpen(false);
                  setSearchQuery('');
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    handlePrevMatch();
                  } else {
                    handleNextMatch();
                  }
                }
              }}
              className="w-full bg-white border border-[#d5d0c5] rounded-lg px-3 py-1.5 text-xs text-[#17201d] placeholder-[#74776f] outline-none focus:border-[#17201d]"
            />
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            {searchQuery.trim() && (
              <span className="text-[#74776f] px-2 font-mono" aria-label="Match count">
                {matches.length > 0 ? (
                  `${activeMatchIndex + 1} of ${matches.length}`
                ) : (
                  <span className="text-[#ff5c3d] font-bold">No matches</span>
                )}
              </span>
            )}

            <button
              type="button"
              onClick={handlePrevMatch}
              disabled={matches.length === 0}
              className="p-1.5 rounded-lg border border-[#d5d0c5] bg-white text-[#17201d] hover:border-[#17201d] disabled:opacity-40"
              title="Previous match (Shift + Enter)"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMatch}
              disabled={matches.length === 0}
              className="p-1.5 rounded-lg border border-[#d5d0c5] bg-white text-[#17201d] hover:border-[#17201d] disabled:opacity-40"
              title="Next match (Enter)"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={`px-2 py-1 rounded text-xs font-mono font-bold border ${
                caseSensitive
                  ? 'bg-[#c6f05b] text-[#17201d] border-[#17201d]'
                  : 'bg-white text-[#74776f] border-[#d5d0c5]'
              }`}
              title="Match Case"
            >
              Aa
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery('');
              }}
              className="p-1 text-[#74776f] hover:text-[#17201d]"
              title="Close search (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error or Notice Banners */}
      {zipError && (
        <div className="mb-4 p-3 rounded-xl border border-[#ff5c3d] bg-[#fef2f2] text-xs font-mono text-[#b91c1c] flex items-center justify-between">
          <span>{zipError}</span>
          <button type="button" onClick={() => setZipError(null)} className="p-1 text-[#b91c1c] hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Inline Revision History & Diff Workspace */}
      {showRevisionWorkspace && paste && (
        <RevisionWorkspace
          paste={paste}
          revisions={revisions}
          onClose={() => setShowRevisionWorkspace(false)}
          error={revisionError}
          onRetry={() => fetchRevisions(paste.id)}
        />
      )}

      {/* Main Terminal Editor Shell Container with Workspace Sidebar Navigation */}
      <div className="editor-shell flex flex-col md:flex-row !p-0 overflow-hidden">
        {/* Workspace Files Navigation: Responsive Mobile Dropdown and Desktop Sidebar */}
        {isMultiFile && (
          <>
            {/* Mobile File Selector Dropdown */}
            <div className="block md:hidden border-b border-[#2a322f] bg-[#121615] p-2.5">
              <label htmlFor="mobile-file-select" className="sr-only">
                Select workspace file
              </label>
              <NativeSelect
                id="mobile-file-select"
                aria-label="Select workspace file"
                value={files[safeActiveIndex]?.id !== undefined ? String(files[safeActiveIndex].id) : (files[safeActiveIndex]?.filename || 'default')}
                onChange={(val) => {
                  const targetId = String(val);
                  const searchParams = new URLSearchParams(location.search);
                  const token = searchParams.get('token') || shareToken || paste.shareToken;
                  let targetUrl = `/p/${paste.id}/file/${encodeURIComponent(targetId)}`;
                  if (token) {
                    targetUrl += `?token=${encodeURIComponent(token)}`;
                  }
                  navigate(targetUrl);
                }}
                className="w-full bg-[#1e2523] text-[#c6f05b] border border-[#2a322f] rounded-lg px-3 py-2 text-xs font-mono font-bold outline-none focus:border-[#c6f05b]"
              >
                {files.map((file, idx) => {
                  const targetFileId = file.id !== undefined ? String(file.id) : (isMultiFile ? file.filename : 'default');
                  return (
                    <option key={file.id ?? file.filename ?? idx} value={targetFileId}>
                      {idx + 1}. {file.filename} {file.language ? `(${file.language})` : ''}
                    </option>
                  );
                })}
              </NativeSelect>
            </div>

            {/* Desktop Sidebar Navigation */}
            <nav
              aria-label="Workspace files"
              className={`${isSidebarCollapsed ? 'hidden' : 'flex'} w-60 border-r border-[#2a322f] bg-[#121615] flex-col shrink-0`}
            >
              <div className="px-3 py-2.5 border-b border-[#2a322f] text-[11px] font-mono uppercase tracking-wider text-[#74776f] font-semibold flex items-center justify-between">
                <span>Files ({files.length})</span>
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  aria-label={isSidebarCollapsed ? 'Expand files sidebar' : 'Collapse files sidebar'}
                  title={isSidebarCollapsed ? 'Expand files sidebar' : 'Collapse files sidebar'}
                  className="text-[#a6aea9] hover:text-white p-1 rounded hover:bg-[#1e2523] transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5 -rotate-90" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-[550px] py-1">
                {files.map((file, idx) => {
                  const targetFileId = file.id !== undefined ? String(file.id) : (isMultiFile ? file.filename : 'default');
                  const searchParams = new URLSearchParams(location.search);
                  const token = searchParams.get('token') || shareToken || paste.shareToken;
                  let targetUrl = `/p/${paste.id}/file/${encodeURIComponent(targetFileId)}`;
                  if (token) {
                    targetUrl += `?token=${encodeURIComponent(token)}`;
                  }
                  const isSelected = activeIndex === idx;

                  return (
                    <Link
                      key={file.id ?? file.filename ?? idx}
                      to={targetUrl}
                      className={`flex items-center justify-between px-3 py-2 text-xs font-mono transition-colors border-l-2 ${
                        isSelected
                          ? 'bg-[#1e2523] text-[#c6f05b] border-[#c6f05b] font-bold'
                          : 'text-[#a6aea9] hover:bg-[#18201d] hover:text-white border-transparent'
                      }`}
                      title={file.filename}
                      aria-label={file.filename}
                    >
                      <span className="truncate pr-2">{file.filename}</span>
                      {file.language && (
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#1e2725] text-[#74776f] border border-[#2a322f]">
                          {file.language}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </>
        )}

        {/* Editor Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="editor-top">
            <div className="window-dots" aria-hidden="true">
              <i></i>
              <i></i>
              <i></i>
            </div>

            <div className="flex items-center gap-2 max-w-[60%]">
              {isMultiFile && isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  aria-label="Expand files sidebar"
                  title="Expand files sidebar"
                  className="text-[#a6aea9] hover:text-white p-1 rounded hover:bg-[#1e2523] transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                </button>
              )}

              {isEditing ? (
                <input
                  type="text"
                  value={currentActiveFile.filename}
                  onChange={(e) => handleFilenameChange(e.target.value)}
                  aria-label="Active file name"
                  placeholder="filename.ext"
                  className="bg-[#121615] border border-[#2a322f] text-[#c6f05b] px-2 py-0.5 rounded font-mono text-xs focus:border-[#c6f05b] outline-none"
                />
              ) : (
                <div className="text-center font-mono text-xs text-[#a6aea9] truncate px-4 font-semibold">
                  {currentActiveFile.filename}
                </div>
              )}
            </div>

            <div className="editor-type flex items-center gap-2">
              {isEditing ? (
                <NativeSelect
                  value={currentActiveFile.language || paste.language || 'plaintext'}
                  onChange={(val) => handleLanguageChange(String(val))}
                  aria-label="Active file language"
                  selectSize="sm"
                  wrapperClassName="w-auto"
                  className="bg-[#121615] border border-[#2a322f] text-[#c6f05b] px-2 py-0.5 rounded font-mono text-xs focus:border-[#c6f05b] outline-none uppercase"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <>
                  <Icon name="code" size={14} />
                  <span className="uppercase">{currentActiveFile.language || paste.language}</span>
                </>
              )}
            </div>
          </div>

          {/* In-Editor Inline Editing Action Controls Bar */}
          {isEditing && (
            <div className="bg-[#19221f] border-b border-[#2a322f] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-mono text-[#c6f05b]">
                <Edit3 className="w-3.5 h-3.5" />
                <span className="font-bold">Editing: {currentActiveFile.filename}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelEditing}
                  disabled={isSaving}
                  className="px-3 py-1 rounded bg-[#2a322f] text-[#a6aea9] hover:text-white font-mono text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditing}
                  disabled={isSaving}
                  className="px-3 py-1 rounded bg-[#c6f05b] text-[#17201d] font-mono text-xs font-bold hover:bg-[#b4e048] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* In-Editor Edit Error Alert Banner */}
          {editError && (
            <div className="bg-[#fee2e2] border-b border-[#ef4444] px-4 py-2 text-xs font-mono text-[#b91c1c] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#ef4444] shrink-0" />
                <span>{editError}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditError(null)}
                className="text-[#b91c1c] hover:opacity-75 p-1"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Explicit File Not Found Banner if fileId does not resolve */}
          {isFileNotFound ? (
            <div className="p-8 text-center bg-[#151b19] flex-1 flex flex-col items-center justify-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-[#ff5c3d]" />
              <h2 className="text-base font-bold font-mono text-white">File Not Found</h2>
              <p className="text-xs font-mono text-[#a6aea9] max-w-md">
                The requested file ID <code className="text-[#ff5c3d] font-bold">{fileId}</code> does not exist in this workspace.
              </p>
              <Link
                to={`/p/${paste.id}`}
                className="mt-2 text-xs font-mono text-[#c6f05b] hover:underline"
              >
                ← View primary workspace file
              </Link>
            </div>
          ) : (
            <>
              {/* Live Syntax-Highlighted Code Editor Surface */}
              <div className="code-editor-surface">
                {/* Gutter with clickable line buttons */}
                <div className="code-editor-gutter" ref={lineNumbersRef}>
                  {Array.from({ length: Math.min(lines.length, MAX_GUTTER_LINES) }, (_, index) => {
                    const lineNum = index + 1;
                    const isLineTargeted = activeLine === lineNum;
                    return (
                      <button
                        key={index}
                        type="button"
                        aria-label={`Line ${lineNum}`}
                        className={isLineTargeted ? 'line-target-highlight' : ''}
                        onClick={() => {
                          window.location.hash = `#L${lineNum}`;
                          setActiveLine(lineNum);
                        }}
                      >
                        {lineNum}
                      </button>
                    );
                  })}
                  {lines.length > MAX_GUTTER_LINES && (
                    <span key="overflow" className="text-[#a5a9a0] opacity-50" title={`${lines.length} total lines`}>
                      …
                    </span>
                  )}
                </div>

                <div className="code-editor-scroll-area">
                  {/* Syntax Highlighted Backdrop Layer */}
                  <pre
                    ref={highlightRef}
                    className={`code-highlight-layer language-${currentActiveFile.language || paste.language} ${wrapLines ? 'code-wrap' : ''}`}
                    aria-hidden="true"
                  >
                    <code className={`language-${currentActiveFile.language || paste.language}`}>
                      {lines.map((line, i) => {
                        const lineNum = i + 1;
                        const isLineTargeted = activeLine === lineNum;
                        return (
                          <div
                            key={i}
                            className={isLineTargeted ? 'line-target-highlight' : ''}
                            style={{ minHeight: '22px', lineHeight: '22px', boxSizing: 'border-box' }}
                          >
                            {renderLineContent(line, i)}
                          </div>
                        );
                      })}
                      {currentActiveFile.content.endsWith('\n') ? ' ' : null}
                    </code>
                  </pre>

                  {/* Synchronized Textarea Layer (readOnly when !isEditing) */}
                  <textarea
                    ref={textareaRef}
                    value={currentActiveFile.content}
                    readOnly={!isEditing}
                    onChange={(e) => {
                      if (isEditing) {
                        handleContentChange(e.target.value);
                      }
                    }}
                    onScroll={handleScroll}
                    wrap={wrapLines ? 'on' : 'off'}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    aria-label={`Content of ${currentActiveFile.filename}${!isEditing ? ' (Read only)' : ''}`}
                    className={`code-textarea-layer ${wrapLines ? 'code-wrap' : ''} ${isEditing ? '!pointer-events-auto !cursor-text' : ''}`}
                  />
                </div>
              </div>

              <div className="editor-footer">
                <span>
                  {currentActiveFile.filename}: {lines.length} lines · {(new Blob([currentActiveFile.content]).size / 1024).toFixed(1)} KB
                  {isMultiFile && ` (File ${safeActiveIndex + 1} of ${files.length} · Total: ${(paste.contentSizeBytes / 1024).toFixed(1)} KB)`}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`status-dot ${isEditing ? '!bg-[#c6f05b]' : ''}`}></span>
                  <span>{isEditing ? 'Editing workspace' : 'Read-only workspace'}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Manual Copy Fallback Modal */}
      {manualCopyText !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-copy-title"
          className="modal-backdrop"
          onClick={() => setManualCopyText(null)}
        >
          <div className="modal-paper max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="eyebrow">CLIPBOARD FALLBACK</div>
              <h2 id="manual-copy-title" className="modal-title">Manual Copy</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setManualCopyText(null)}
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs font-mono text-[#74776f] mb-3">
              Press Ctrl+C to copy the selected text below:
            </p>
            <textarea
              readOnly
              autoFocus
              value={manualCopyText}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full h-40 p-2 font-mono text-xs bg-[#faf8f2] border border-[#d5d0c5] rounded-lg outline-none focus:border-[#17201d]"
            />
            <div className="modal-actions mt-4 flex justify-end">
              <button
                type="button"
                className="action-btn action-btn-primary"
                onClick={() => setManualCopyText(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Threaded Replies Section */}
      {paste && (
        <PasteRepliesSection paste={paste} />
      )}

      {/* Discard Unsaved Changes Confirmation Modal */}
      {showDiscardConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-modal-title"
          className="modal-backdrop"
          onClick={() => setShowDiscardConfirm(false)}
        >
          <div className="modal-paper max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-[#ff5c3d]">
              <AlertTriangle className="w-6 h-6 text-[#ff5c3d]" />
              <h2 id="discard-modal-title" className="text-base font-bold font-mono text-[#17201d] m-0">
                Discard unsaved changes?
              </h2>
            </div>
            <p className="text-xs font-mono text-[#74776f] leading-relaxed">
              You have unsaved changes in this workspace. Are you sure you want to discard your edits? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="action-btn"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscard}
                className="action-btn action-btn-danger"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit & Revision Modals */}
      {paste && showEditModal && (
        <EditPasteModal
          paste={paste}
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={(updated) => setPaste(updated)}
        />
      )}

      {paste && showHistoryModal && (
        <RevisionHistoryModal
          pasteId={paste.id}
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {/* Anonymous Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <form
            onSubmit={handleDeleteAnonymous}
            className="w-full max-w-md paper-card p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3 text-[#ff5c3d]">
              <KeyRound className="w-6 h-6" />
              <h2 className="text-lg font-bold text-[#17201d]">Delete Anonymous Paste</h2>
            </div>
            <p className="text-xs font-mono text-[#74776f] leading-relaxed">
              Enter the secret deletion capability token provided when this paste was originally created.
            </p>

            {deleteError && (
              <div className="p-3 rounded-lg bg-red-100 border border-red-800 text-xs text-red-900 font-mono">
                {deleteError}
              </div>
            )}

            <div>
              <input
                type="text"
                placeholder="del_..."
                value={deletionCapability}
                onChange={(e) => setDeletionCapability(e.target.value)}
                className="w-full font-mono text-xs px-3.5 py-2.5 bg-white border border-[#aaa89f] rounded-lg text-[#17201d] outline-none focus:border-[#17201d]"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="action-btn"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDeleting || !deletionCapability.trim()}
                className="action-btn action-btn-danger"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Embed Snippet Modal */}
      {showEmbedModal && paste && (
        <EmbedModal
          isOpen={showEmbedModal}
          onClose={() => setShowEmbedModal(false)}
          pasteId={paste.id}
          pasteTitle={paste.title}
        />
      )}

      {/* QR Code Modal */}
      {showQrModal && paste && (
        <QrCodeModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          pasteId={paste.id}
          pasteTitle={paste.title}
        />
      )}

      {/* Share Management Modal */}
      {showShareModal && paste && (
        <ShareManagementModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          paste={paste}
          onStatusChanged={(status, newShareToken) => {
            setPaste((prev) => (prev ? { ...prev, shareStatus: status, shareToken: newShareToken ?? prev.shareToken } : null));
            if (newShareToken) {
              setShareToken(newShareToken);
            }
          }}
          storedCapability={localStorage.getItem(`extrabin_del_${paste.id}`)}
        />
      )}
    </div>
  );
};

export default ViewPastePage;
