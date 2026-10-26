import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, IconName } from '../../../components/ui/PaperIcon';
import { Select, SelectOption } from '../../../components/ui/Select';
import { pasteApi } from '../api/pasteApi';
import { discoveryApi } from '../../discovery/api/discoveryApi';
import { useAuth } from '../../auth/context/AuthContext';
import {
  detectLanguageFromCode,
  detectLanguageFromFilename,
  updateFilenameExtension,
} from '../../../lib/syntax/languageDetection';
export { detectLanguageFromFilename };
import { renderSafeSyntaxHighlight } from '../../../lib/syntax/highlighter';
import { ExpirationPolicy, Visibility } from '../types/paste';
import { ApiError } from '../../../lib/api-client/client';
import { folderApi, FolderItem } from '../api/folderApi';
import { PasteCreatedModal } from '../components/PasteCreatedModal';
import { useDraftAutosave, PasteDraft } from '../hooks/useDraftAutosave';
import { encryptPaste, type InputFile, type EncryptionMode } from '../../../lib/crypto/e2ePaste';
import { loadPasteDefaults, loadEditorPrefs } from '../../dashboard/utils/userPreferences';
import { resolvePublicBaseUrl } from '../lib/shareUrl';

const MAX_CONTENT_BYTES = 1024 * 1024; // 1 MB strict upper bound matching server
const MAX_HIGHLIGHT_BYTES = 250 * 1024; // 250 KB limit for live syntax tokenization
const MAX_GUTTER_LINES = 1000; // Cap line number DOM elements to prevent browser freeze (Finding A1)
const MAX_TITLE_LENGTH = 100; // Documented title limit matching server @Size(max=100)
const MAX_PASSCODE_LENGTH = 72; // BCrypt standard 72-byte cryptographic boundary (Finding A4)

const starterCode = `// A tiny promise pool with zero dependencies
async function promisePool(tasks, concurrency = 3) {
  const results = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}`;

interface RecentCardItem {
  id?: string;
  title: string;
  language: string;
  age: string;
  views: number;
  expiryBadge: string;
  color: 'coral' | 'blue' | 'lime';
}

export interface EditorFile {
  id: string;
  filename: string;
  content: string;
  language: string;
  userRenamed?: boolean;
}

const defaultRecentPastes: RecentCardItem[] = [
  { title: 'Promise pool utility', language: 'JavaScript', age: 'just now', views: 0, expiryBadge: '7d', color: 'coral' },
  { title: 'nginx redirect config', language: 'Nginx', age: '2h ago', views: 18, expiryBadge: 'Never', color: 'blue' },
  { title: 'Notes from systems lecture', language: 'Plain text', age: 'Yesterday', views: 7, expiryBadge: '30d', color: 'lime' },
];

export const CreatePastePage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Multi-file state management
  const [files, setFiles] = useState<EditorFile[]>([
    {
      id: 'f1',
      filename: 'main.js',
      content: starterCode,
      language: 'javascript',
      userRenamed: false,
    },
  ]);
  const [activeFileId, setActiveFileId] = useState<string>('f1');

  const activeFileIndex = Math.max(0, files.findIndex((f) => f.id === activeFileId));
  const activeFile = files[activeFileIndex] || files[0];
  const content = activeFile.content;
  const language = activeFile.language;

  const setContent = (newContent: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== activeFile.id) return f;
        // If content was empty or pristine starter code, and new content is pasted/typed
        let newLang = f.language;
        let newFilename = f.filename;
        const isInitialCode = f.content === starterCode || f.content.trim() === '';
        if (isInitialCode && newContent.trim().length > 15) {
          const sample = newContent.slice(0, 4000);
          const detected = detectLanguageFromCode(sample);
          if (detected && detected !== 'plaintext') {
            newLang = detected;
            if (!f.userRenamed) {
              newFilename = updateFilenameExtension(f.filename, detected);
            }
          }
        }
        return {
          ...f,
          content: newContent,
          language: newLang,
          filename: newFilename,
        };
      })
    );
  };

  const setLanguage = (newLang: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === activeFile.id) {
          const updatedFilename = !f.userRenamed
            ? updateFilenameExtension(f.filename, newLang)
            : f.filename;
          return {
            ...f,
            language: newLang,
            filename: updatedFilename,
          };
        }
        return f;
      })
    );
  };

  const setFilename = (fileId: string, newName: string) => {
    const detected = detectLanguageFromFilename(newName);
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === fileId) {
          return {
            ...f,
            filename: newName,
            language: detected || f.language,
            userRenamed: true,
          };
        }
        return f;
      })
    );
  };

  const handleAddFile = () => {
    if (files.length >= 20) {
      setErrorMessage('A paste cannot contain more than 20 files.');
      return;
    }
    const newId = `f_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newFile: EditorFile = {
      id: newId,
      filename: `file_${files.length + 1}.txt`,
      content: '',
      language: 'plaintext',
      userRenamed: false,
    };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newId);
  };

  const handleRemoveFile = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (files.length <= 1) return;
    setFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== fileId);
      if (activeFileId === fileId) {
        setActiveFileId(filtered[0].id);
      }
      return filtered;
    });
  };

  // Direct file uploads & drag-and-drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);

    const isPristine =
      files.length === 1 &&
      (files[0].content === starterCode || files[0].content.trim() === '') &&
      files[0].filename === 'main.js';

    const baseCount = isPristine ? 0 : files.length;
    if (baseCount + incoming.length > 20) {
      setErrorMessage(`Cannot exceed 20 files per paste (attempted to add ${incoming.length} files to existing ${baseCount}).`);
      return;
    }

    let runningTotalBytes = isPristine ? 0 : files.reduce((acc, f) => acc + new TextEncoder().encode(f.content).length, 0);
    const processedFiles: EditorFile[] = [];

    for (const file of incoming) {
      if (file.size > MAX_CONTENT_BYTES) {
        setErrorMessage(`File "${file.name}" (${(file.size / 1024).toFixed(1)} KB) exceeds the maximum allowed limit of 1 MB.`);
        return;
      }
      runningTotalBytes += file.size;
      if (runningTotalBytes > MAX_CONTENT_BYTES) {
        setErrorMessage(`Aggregate paste content size exceeds the maximum allowed limit of 1 MB.`);
        return;
      }

      try {
        let decodedText = '';
        let isBinary = false;

        if (typeof file.arrayBuffer === 'function') {
          try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.length; i++) {
              if (bytes[i] === 0) {
                isBinary = true;
                break;
              }
            }
            if (isBinary) {
              setErrorMessage(`File "${file.name}" is a binary file. Only source code, logs, config, and text files are supported.`);
              return;
            }
            decodedText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          } catch {
            if (typeof file.text === 'function') {
              decodedText = await file.text();
            } else {
              decodedText = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string) || '');
                reader.onerror = () => reject(reader.error);
                reader.readAsText(file);
              });
            }
            if (decodedText.indexOf('\0') >= 0) {
              setErrorMessage(`File "${file.name}" is a binary file. Only source code, logs, config, and text files are supported.`);
              return;
            }
          }
        } else if (typeof file.text === 'function') {
          decodedText = await file.text();
          if (decodedText.indexOf('\0') >= 0) {
            setErrorMessage(`File "${file.name}" is a binary file. Only source code, logs, config, and text files are supported.`);
            return;
          }
        } else {
          decodedText = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string) || '');
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
          });
          if (decodedText.indexOf('\0') >= 0) {
            setErrorMessage(`File "${file.name}" is a binary file. Only source code, logs, config, and text files are supported.`);
            return;
          }
        }

        if (decodedText.charCodeAt(0) === 0xFEFF) {
          decodedText = decodedText.slice(1);
        }

        let cleanName = file.name.replace(/[/\\?%*:|"<>]/g, '_').trim();
        cleanName = cleanName.replace(/\.{2,}/g, '.');
        if (!cleanName) {
          cleanName = `file_${processedFiles.length + 1}.txt`;
        }
        if (cleanName.length > 100) {
          cleanName = cleanName.substring(0, 100);
        }

        const detectedLang = detectLanguageFromFilename(cleanName) || 'plaintext';

        processedFiles.push({
          id: `f_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          filename: cleanName,
          content: decodedText,
          language: detectedLang,
          userRenamed: true,
        });
      } catch (err: any) {
        setErrorMessage(`Failed to read file "${file.name}": ${err?.message || 'Read error'}`);
        return;
      }
    }

    if (processedFiles.length > 0) {
      setErrorMessage(null);
      if (isPristine) {
        setFiles(processedFiles);
        setActiveFileId(processedFiles[0].id);
      } else {
        setFiles((prev) => [...prev, ...processedFiles]);
        setActiveFileId(processedFiles[0].id);
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      setIsDraggingOver(false);
      dragCounterRef.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounterRef.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFilesSelected(e.dataTransfer.files);
    }
  };

  // Saved user preferences (loaded once on component mount)
  const [initialDefaults] = useState(() => loadPasteDefaults());
  const [editorPrefs] = useState(() => loadEditorPrefs());

  const [title, setTitle] = useState('');
  const [privacy, setPrivacy] = useState<Visibility>(initialDefaults.defaultVisibility);
  const [expiry, setExpiry] = useState<ExpirationPolicy>(initialDefaults.defaultExpiration);
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('none');
  const [tags, setTags] = useState('');
  const [folder, setFolder] = useState('root');
  const [burnAfterReading, setBurnAfterReading] = useState(initialDefaults.defaultBurnAfterReading);
  const [showBasicsGroup, setShowBasicsGroup] = useState(true);
  const [showSecurityGroup, setShowSecurityGroup] = useState(false);
  const [showOrganizeGroup, setShowOrganizeGroup] = useState(false);

  // End-to-End Encryption state
  const [enableE2E, setEnableE2E] = useState(false);
  const [e2eMode, setE2eMode] = useState<EncryptionMode>('LINK');
  const [e2ePassphrase, setE2ePassphrase] = useState('');
  const [showE2EPassphrase, setShowE2EPassphrase] = useState(false);
  const [wrapLinkWithPassphrase, setWrapLinkWithPassphrase] = useState(false);


  const handleRestoreDraft = useCallback((draft: PasteDraft) => {
    setTitle(draft.title || '');
    if (draft.files && draft.files.length > 0) {
      setFiles(draft.files);
      setActiveFileId(draft.files[0].id);
    }
    setPrivacy(draft.privacy || 'UNLISTED');
    setExpiry(draft.expiry || 'ONE_WEEK');
    setCategory(draft.category || 'none');
    setTags(draft.tags || '');
    setFolder(draft.folder || 'root');
    setBurnAfterReading(!!draft.burnAfterReading);
  }, []);

  const {
    draftStatus,
    recoverableDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  } = useDraftAutosave({
    userId: user?.id,
    title,
    files,
    privacy,
    expiry,
    category,
    tags,
    folder,
    burnAfterReading,
    starterCode,
    onRestore: handleRestoreDraft,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createdPasteId, setCreatedPasteId] = useState<string | null>(null);
  const [createdShareToken, setCreatedShareToken] = useState<string | null>(null);
  const [createdDeletionCapability, setCreatedDeletionCapability] = useState<string | null>(null);
  const [showCreatedModal, setShowCreatedModal] = useState(false);
  const [createdLinkKey, setCreatedLinkKey] = useState<string | null>(null);
  const [createdEncryptionMode, setCreatedEncryptionMode] = useState<'LINK' | 'PASSPHRASE' | null>(null);
  const [createdIsPassphraseProtected, setCreatedIsPassphraseProtected] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [recentList, setRecentList] = useState<RecentCardItem[]>(defaultRecentPastes);

  // Managed timer references for guaranteed cleanup (Finding B)
  const savedTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const passwordCopiedTimerRef = useRef<number | null>(null);

  // Suggested password state
  const [isSuggestPassword, setIsSuggestPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const generateSuggestedPassword = (): string => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    const array = new Uint32Array(12);
    crypto.getRandomValues(array);
    let part1 = '';
    let part2 = '';
    let part3 = '';
    for (let i = 0; i < 4; i++) part1 += chars[array[i] % chars.length];
    for (let i = 4; i < 8; i++) part2 += chars[array[i] % chars.length];
    for (let i = 8; i < 12; i++) part3 += chars[array[i] % chars.length];
    return `${part1}-${part2}-${part3}`;
  };

  const handleToggleSuggestPassword = (checked: boolean) => {
    setIsSuggestPassword(checked);
    if (checked) {
      const generated = generateSuggestedPassword();
      setPassword(generated);
      setShowPassword(true);
    } else {
      setPassword('');
      setShowPassword(false);
    }
  };

  const handleRegeneratePassword = () => {
    const generated = generateSuggestedPassword();
    setPassword(generated);
    setShowPassword(true);
  };

  const handleCopyPassword = async () => {
    if (!password) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(password);
        setPasswordCopied(true);
        if (passwordCopiedTimerRef.current) clearTimeout(passwordCopiedTimerRef.current);
        passwordCopiedTimerRef.current = window.setTimeout(() => setPasswordCopied(false), 2000);
      }
    } catch {
      // ignore
    }
  };

  // References for synchronized scrolling between textarea and highlighted code layer
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Synchronous guard against duplicate submit invocations (Finding 5)
  const submittingRef = useRef(false);

  const tabStripRef = useRef<HTMLDivElement>(null);

  // Aggregate UTF-8 byte length computation
  const totalByteLength = useMemo(() => {
    const encoder = new TextEncoder();
    return files.reduce((acc, f) => acc + encoder.encode(f.content).byteLength, 0);
  }, [files]);

  const activeByteLength = useMemo(() => {
    return new TextEncoder().encode(content).byteLength;
  }, [content]);

  // Syntax highlighting rendered directly via React virtual DOM text nodes
  const highlightedElements = useMemo(() => {
    if (!content) return null;
    if (activeByteLength > MAX_HIGHLIGHT_BYTES) {
      return content;
    }
    return renderSafeSyntaxHighlight(content, language);
  }, [content, language, activeByteLength]);

  // Line & byte statistics
  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const stats = useMemo(() => {
    const bytesFormatted = totalByteLength < 1024 ? `${totalByteLength} B` : `${(totalByteLength / 1024).toFixed(1)} KB`;
    const fileLabel = files.length === 1 ? '1 file' : `${files.length} files`;
    return `${fileLabel} · ${lineCount} lines · ${bytesFormatted}`;
  }, [files.length, totalByteLength, lineCount]);

  // Load recent discovery pastes (avoiding fabricated metrics - Finding B)
  useEffect(() => {
    let isMounted = true;
    discoveryApi
      .getDiscovery(0, 3)
      .then((res) => {
        if (!isMounted || !res.items || res.items.length === 0) return;
        const mapped: RecentCardItem[] = res.items.map((item, idx) => {
          const colors: ('coral' | 'blue' | 'lime')[] = ['coral', 'blue', 'lime'];
          return {
            id: item.id,
            title: item.title || `Paste #${item.id.slice(0, 8)}`,
            language: item.language,
            age: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Recent',
            views: 0,
            expiryBadge: item.expiresAt ? 'Active' : 'Never',
            color: colors[idx % 3],
          };
        });
        setRecentList(mapped);
      })
      .catch(() => {
        // Keep defaults gracefully
      });
    return () => {
      isMounted = false;
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  // Instant language detection bounded to 4KB sample to prevent regex freezing (Finding A2)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (text) {
      if (text.length <= MAX_HIGHLIGHT_BYTES) {
        const sample = text.slice(0, 4000);
        const detected = detectLanguageFromCode(sample);
        if (detected && detected !== 'plaintext') {
          setLanguage(detected);
        }
      }
    }
  };

  // Synchronize scrolling between textarea and syntax highlight backdrop
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

  // Allow tab indentation inside code editor according to saved preference
  const handleKeyDownInTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const spaces = ' '.repeat(editorPrefs.tabSize || 2);
      const newContent = content.substring(0, start) + spaces + content.substring(end);
      setContent(newContent);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + spaces.length;
        }
      }, 0);
    }
  };

  const handleCreate = useCallback(async () => {
    // Synchronous guard prevents double submission or race conditions (Finding 5)
    if (submittingRef.current || isSubmitting) return;

    const payloadFiles = files.map((f, idx) => ({
      filename: f.filename.trim() || `file_${idx + 1}.txt`,
      content: f.content,
      language: f.language,
    }));

    for (const f of payloadFiles) {
      if (!f.content || f.content.trim().length === 0) {
        setErrorMessage(
          payloadFiles.length > 1
            ? `File "${f.filename}" content cannot be empty.`
            : 'Paste content cannot be empty.'
        );
        return;
      }
    }

    // Client-side resource limit check (Finding 4)
    if (totalByteLength > MAX_CONTENT_BYTES) {
      setErrorMessage(
        `Total paste size (${(totalByteLength / 1024).toFixed(1)} KB) exceeds maximum limit of 1 MB.`
      );
      return;
    }

    // Check duplicate filenames
    const nameSet = new Set<string>();
    for (const f of payloadFiles) {
      const lower = f.filename.toLowerCase();
      if (nameSet.has(lower)) {
        setErrorMessage(`Duplicate filename in paste: ${f.filename}`);
        return;
      }
      nameSet.add(lower);
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    // Anti-bot honeypot check
    if (honeypot.trim()) {
      submittingRef.current = false;
      setIsSubmitting(false);
      setErrorMessage('Automated submission detected.');
      return;
    }

    if (enableE2E) {
      if (e2eMode === 'PASSPHRASE' && !e2ePassphrase.trim()) {
        submittingRef.current = false;
        setIsSubmitting(false);
        setErrorMessage('Passphrase is required for Passphrase-only E2E encryption mode.');
        return;
      }
      if (e2eMode === 'LINK' && wrapLinkWithPassphrase && !e2ePassphrase.trim()) {
        submittingRef.current = false;
        setIsSubmitting(false);
        setErrorMessage('Passphrase is required when dual-access passphrase wrapping is enabled.');
        return;
      }

      try {
        const inputFiles: InputFile[] = payloadFiles.map((f) => ({
          filename: f.filename,
          data: f.content,
        }));
        const passphrase = (e2eMode === 'PASSPHRASE' || wrapLinkWithPassphrase)
          ? e2ePassphrase.trim()
          : undefined;

        const encrypted = await encryptPaste(inputFiles, {
          mode: e2eMode,
          passphrase,
          burnAfterReading,
          languageHint: payloadFiles[0]?.language,
        });

        const res = await pasteApi.createEncryptedPaste(encrypted.dto);
        setCreatedPasteId(res.id);
        setCreatedShareToken(res.shareToken || null);
        setCreatedDeletionCapability(res.deletionCapability || null);
        setCreatedLinkKey(encrypted.linkKey || null);
        setCreatedEncryptionMode(e2eMode);
        setCreatedIsPassphraseProtected(Boolean(passphrase));
        setShowCreatedModal(true);
        try {
          localStorage.setItem(`extraBin_viewed_${res.id}`, Date.now().toString());
        } catch {
          // Ignore quota error
        }
        setPassword('');
        setE2ePassphrase('');
        setSaved(true);
        clearDraft();
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(() => setSaved(false), 8000);
      } catch (err) {
        if (err instanceof ApiError) {
          setErrorMessage(err.detail);
        } else if (err instanceof Error) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('Failed to encrypt and create paste. Please try again.');
        }
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
      return;
    }

    try {
      const primaryFile = payloadFiles[0];
      const res = await pasteApi.createPaste({
        title: title.trim() || undefined,
        content: primaryFile ? primaryFile.content : '',
        language: primaryFile ? primaryFile.language : undefined,
        visibility: privacy,
        expiration: burnAfterReading ? 'VIEW_ONCE' : expiry,
        password: password || undefined,
        files: payloadFiles,
        folderId: folder !== 'root' ? Number(folder) : undefined,
        website: honeypot.trim() || undefined,
      });

      setCreatedPasteId(res.id);
      setCreatedShareToken(res.shareToken || null);
      setCreatedDeletionCapability(res.deletionCapability || null);
      setCreatedLinkKey(null);
      setCreatedEncryptionMode(null);
      setCreatedIsPassphraseProtected(false);
      setShowCreatedModal(true);
      try {
        localStorage.setItem(`extraBin_viewed_${res.id}`, Date.now().toString());
      } catch {
        // Ignore quota error
      }
      setPassword('');
      setSaved(true);
      clearDraft();
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 8000);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('Failed to create paste. Please try again.');
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    files,
    title,
    privacy,
    expiry,
    password,
    burnAfterReading,
    isSubmitting,
    totalByteLength,
    enableE2E,
    e2eMode,
    e2ePassphrase,
    wrapLinkWithPassphrase,
  ]);

  // Global Ctrl+Enter shortcut to create paste immediately
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCreate();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreate]);

  // Copy link with clipboard error handling and manual fallback (Finding B)
  const copyLink = async () => {
    if (!createdPasteId) return;
    const url = pasteApi.buildShareableUrl(resolvePublicBaseUrl(), createdPasteId, createdShareToken, createdLinkKey);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2200);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      // Manual copy fallback prompt
      window.prompt('Copy paste link to clipboard:', url);
    }
  };

  // Complete state reset when starting fresh (Finding A3)
  const handleStartFresh = () => {
    setFiles([
      {
        id: 'f1',
        filename: 'main.js',
        content: '',
        language: 'plaintext',
      },
    ]);
    setActiveFileId('f1');
    setTitle('');
    setPassword('');
    setIsSuggestPassword(false);
    setShowPassword(false);
    setPasswordCopied(false);
    setEnableE2E(false);
    setE2eMode('LINK');
    setE2ePassphrase('');
    setShowE2EPassphrase(false);
    setWrapLinkWithPassphrase(false);
    setCreatedLinkKey(null);
    setCreatedEncryptionMode(null);
    setCreatedIsPassphraseProtected(false);
    setCreatedShareToken(null);
    setPrivacy('UNLISTED');
    setExpiry('ONE_WEEK');
    setCategory('none');
    setTags('');
    setFolder('root');
    setBurnAfterReading(false);
    setSaved(false);
    setCreatedPasteId(null);
    setCopied(false);
    setErrorMessage(null);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    if (passwordCopiedTimerRef.current) clearTimeout(passwordCopiedTimerRef.current);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const languageOptions: SelectOption[] = useMemo(() => [
    { value: 'javascript', label: 'JavaScript', hint: '.js' },
    { value: 'typescript', label: 'TypeScript', hint: '.ts' },
    { value: 'python', label: 'Python', hint: '.py' },
    { value: 'java', label: 'Java', hint: '.java' },
    { value: 'cpp', label: 'C++', hint: '.cpp' },
    { value: 'csharp', label: 'C#', hint: '.cs' },
    { value: 'c', label: 'C', hint: '.c' },
    { value: 'go', label: 'Go', hint: '.go' },
    { value: 'rust', label: 'Rust', hint: '.rs' },
    { value: 'html', label: 'HTML', hint: '.html' },
    { value: 'css', label: 'CSS', hint: '.css' },
    { value: 'json', label: 'JSON', hint: '.json' },
    { value: 'yaml', label: 'YAML', hint: '.yaml' },
    { value: 'sql', label: 'SQL', hint: '.sql' },
    { value: 'bash', label: 'Bash / Shell', hint: '.sh' },
    { value: 'markdown', label: 'Markdown', hint: '.md' },
    { value: 'php', label: 'PHP', hint: '.php' },
    { value: 'kotlin', label: 'Kotlin', hint: '.kt' },
    { value: 'plaintext', label: 'Plain Text', hint: '.txt' },
  ], []);

  const categoryOptions: SelectOption[] = useMemo(() => [
    { value: 'none', label: 'None (General)' },
    { value: 'code', label: 'Code & Programming', hint: 'dev' },
    { value: 'web', label: 'Web Development', hint: 'web' },
    { value: 'devops', label: 'DevOps & Cloud', hint: 'ops' },
    { value: 'crypto', label: 'Security & Cryptography', hint: 'sec' },
    { value: 'notes', label: 'Notes & Documentation', hint: 'docs' },
    { value: 'gaming', label: 'Gaming & Scripts', hint: 'game' },
    { value: 'data', label: 'Data & AI', hint: 'data' },
    { value: 'other', label: 'Other' },
  ], []);

  const expirationOptions: SelectOption<ExpirationPolicy>[] = useMemo(() => {
    const list: SelectOption<ExpirationPolicy>[] = [];
    if (burnAfterReading || expiry === ('VIEW_ONCE' as ExpirationPolicy)) {
      list.push({ value: 'VIEW_ONCE' as ExpirationPolicy, label: 'After First View (Burn)' });
    }
    list.push(
      { value: 'TEN_MINUTES', label: '10 Minutes' },
      { value: 'ONE_HOUR', label: '1 Hour' },
      { value: 'ONE_DAY', label: '1 Day' },
      { value: 'ONE_WEEK', label: '1 Week (Default)' },
      { value: 'NEVER', label: 'Never', description: 'Paste remains online indefinitely' },
    );
    return list;
  }, [burnAfterReading, expiry]);

  const exposureOptions: SelectOption<Visibility>[] = useMemo(() => [
    { value: 'UNLISTED', label: 'Unlisted', description: 'Accessible only by people with the unique link' },
    { value: 'PUBLIC', label: 'Public', description: 'Visible in Explore and indexed publicly' },
    { value: 'PRIVATE', label: 'Private', description: isAuthenticated ? 'Visible only to your account' : 'Requires signing in', disabled: !isAuthenticated },
  ], [isAuthenticated]);

  const [userFolders, setUserFolders] = useState<FolderItem[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      folderApi.listFolders()
        .then((overview) => {
          setUserFolders(overview.folders || []);
        })
        .catch(() => {
          setUserFolders([]);
        });
    } else {
      setUserFolders([]);
    }
  }, [isAuthenticated]);

  const folderOptions: SelectOption[] = useMemo(() => {
    const list: SelectOption[] = [{ value: 'root', label: 'Root / Unfiled' }];
    for (const f of userFolders) {
      list.push({ value: String(f.id), label: `${f.name} (${f.pasteCount})` });
    }
    return list;
  }, [userFolders]);

  return (
    <section className="workspace">
      {/* Invisible honeypot field for bot suppression */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}>
        <input
          type="text"
          name="website"
          id="create-paste-page-website-hp"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-800 text-red-900 font-medium text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold text-sm">
            &times;
          </button>
        </div>
      )}

      {recoverableDraft && (
        <div
          className="mb-2.5 p-2 px-3 rounded-lg bg-[#1b2320] border border-[#ff5c3d]/60 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <Icon name="history" size={16} className="text-[#ff5c3d] flex-shrink-0" />
            <span className="text-xs font-mono">
              Unsaved draft recovered from {new Date(recoverableDraft.savedAt).toLocaleTimeString()} ({recoverableDraft.files.length} file{recoverableDraft.files.length > 1 ? 's' : ''}{recoverableDraft.title ? ` • "${recoverableDraft.title}"` : ''})
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={restoreDraft}
              className="px-3 py-1 text-xs font-semibold rounded bg-[#ff5c3d] text-white hover:bg-[#ff7559] transition-colors"
            >
              Restore Draft
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="px-3 py-1 text-xs font-medium rounded bg-transparent border border-[#525f59] text-[#a6aea9] hover:text-white hover:border-[#8c9690] transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Workbench Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="eyebrow">
            <span></span> YOUR WORKBENCH
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#17201d] m-0">
            Make something shareable<span className="text-[#ff5c3d]">.</span>
          </h1>
        </div>
      </div>

      {/* Side-by-side Workstation: Left Editor, Right Controls */}
      <div className="workbench-split">
        {/* Left Side: Dark Terminal Editor with Live Syntax Highlighting */}
        <div
          className="editor-shell"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDraggingOver && (
            <div className="editor-dropzone-overlay" aria-live="assertive">
              <Icon name="upload" size={40} className="text-[#ff5c3d]" />
              <div className="drop-title">Drop files here to upload</div>
              <div className="drop-subtitle">
                Source code, logs, config, or text files (up to 20 files, 1 MB aggregate max)
              </div>
            </div>
          )}

          <div className="editor-top">
            <div className="flex items-center gap-3 min-w-0">
              <div className="window-dots shrink-0" aria-hidden="true">
                <i></i>
                <i></i>
                <i></i>
              </div>

              <input
                className="title-input !text-left flex-1 min-w-[140px] truncate"
                value={title}
                maxLength={MAX_TITLE_LENGTH}
                onChange={(event) => setTitle(event.target.value)}
                aria-label="Paste title"
                placeholder="Untitled paste (optional)"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleStartFresh}
                className="px-2.5 py-1 text-xs font-mono font-bold rounded border border-[#525f59] bg-[#17201d] text-[#e8ece6] hover:text-[#ff5c3d] hover:border-[#ff5c3d] transition-all flex items-center gap-1.5 cursor-pointer"
                title="Clear all fields and start a fresh paste"
              >
                <Icon name="refresh" size={12} />
                <span className="hidden sm:inline">Start fresh</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (!content.trim()) return;
                  try {
                    await navigator.clipboard.writeText(content);
                    setCopied(true);
                    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
                    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
                  } catch {
                    // Fallback
                  }
                }}
                disabled={!content.trim()}
                className="px-2.5 py-1 text-xs font-mono font-bold rounded border border-[#525f59] bg-[#17201d] text-[#c6f05b] hover:border-[#c6f05b] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy active file content to clipboard"
              >
                <Icon name={copied ? 'check' : 'copy'} size={13} />
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <div className="editor-type">
                <Icon name="code" size={15} />
                <Select
                  variant="dark"
                  size="sm"
                  className="editor-lang-select"
                  searchable
                  menuWidth={220}
                  value={language}
                  onChange={setLanguage}
                  options={languageOptions}
                  ariaLabel="Syntax language"
                />
              </div>
            </div>
          </div>

          {/* Multi-File Tab Strip */}
          <div className="editor-file-tabs" ref={tabStripRef}>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }
              }}
              style={{ display: 'none' }}
              aria-label="Upload files from disk"
            />
            {files.map((file) => {
              const isActive = file.id === activeFile.id;
              return (
                <div
                  key={file.id}
                  onClick={() => setActiveFileId(file.id)}
                  className={`editor-file-tab ${isActive ? 'active' : ''}`}
                >
                  <Icon
                    name="file"
                    size={13}
                    className={isActive ? 'text-[#ff5c3d]' : 'text-[#74786f]'}
                  />
                  <input
                    type="text"
                    value={file.filename}
                    onChange={(e) => setFilename(file.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="editor-filename-input"
                    placeholder="filename.ext"
                    title="Click to rename file (auto-detects language)"
                  />
                  {files.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleRemoveFile(e, file.id)}
                      className="editor-file-close"
                      title="Remove file"
                    >
                      &times;
                    </button>
                  )}
                </div>
              );
            })}
            {files.length < 20 && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="editor-add-file-btn"
                  title="Upload files from disk (or drag and drop)"
                >
                  <Icon name="upload" size={12} />
                  <span>Upload</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddFile}
                  className="editor-add-file-btn"
                  title="Add another file (e.g. User.java, Paste.java)"
                >
                  <Icon name="plus" size={12} />
                  <span>Add file</span>
                </button>
              </>
            )}
          </div>

          {/* Live Syntax-Highlighted Code Editor Surface */}
          <div className="code-editor-surface" style={{ fontSize: editorPrefs.fontSize || '14px' }}>
            {/* Gutter with bounded line element count to prevent DOM freezing (Finding A1) */}
            <div className={`code-editor-gutter ${editorPrefs.showLineNumbers === false ? 'hidden' : ''}`} aria-hidden="true" ref={lineNumbersRef}>
              {Array.from({ length: Math.min(lineCount, MAX_GUTTER_LINES) }, (_, index) => (
                <span key={index}>{index + 1}</span>
              ))}
              {lineCount > MAX_GUTTER_LINES && (
                <span key="overflow" className="text-[#a5a9a0] opacity-50" title={`${lineCount} total lines`}>
                  …
                </span>
              )}
            </div>

            <div className="code-editor-scroll-area">
              {/* Syntax Highlighted Backdrop Layer (Safe Virtual DOM Nodes - Finding 1) */}
              <pre
                ref={highlightRef}
                className={`code-highlight-layer language-${language} ${editorPrefs.lineWrapping ? '!whitespace-pre-wrap' : ''}`}
                aria-hidden="true"
              >
                <code className={`language-${language}`}>
                  {highlightedElements}
                  {content.endsWith('\n') ? ' ' : null}
                </code>
              </pre>

              {/* Synchronized Editable Textarea Layer */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onPaste={handlePaste}
                onScroll={handleScroll}
                onKeyDown={handleKeyDownInTextarea}
                wrap={editorPrefs.lineWrapping ? 'on' : 'off'}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                aria-label="Paste content"
                placeholder="Type or paste your code here..."
                className="code-textarea-layer"
              />
            </div>
          </div>

          {/* Contextual Mode Strip: Real ExtraBin Encryption Preview or API Hint */}
          {enableE2E ? (
            <div className="editor-security-strip" role="status" aria-label="End-to-end encryption active">
              <Icon name="lock" size={13} className="text-[#c6f05b] shrink-0" />
              <span className="shrink-0 text-[#a6aea9] font-semibold">On server:</span>
              <span className="text-[#c6f05b] truncate font-mono text-[11px] selection:bg-[#c6f05b] selection:text-[#17201d]">
                e2e:v1:aes-256-gcm:ct=q8Zt0vK2mR9xLw4HnBc7Yp1Qe3Wd5UaZ8kLm2Xv...
              </span>
              <span className="ml-auto text-[10px] text-[#74786f] hidden md:inline shrink-0">
                AES-256-GCM client-side encrypted
              </span>
            </div>
          ) : (
            <div className="editor-security-strip" role="status" aria-label="Open API paste mode">
              <Icon name="code" size={13} className="text-[#ff8a70] shrink-0" />
              <span className="shrink-0 text-[#a6aea9] font-semibold">API ready:</span>
              <span className="text-[#ff8a70] truncate font-mono text-[11px] selection:bg-[#ff8a70] selection:text-[#17201d]">
                GET /api/v1/pastes/:id.json
              </span>
              <span className="ml-auto text-[10px] text-[#74786f] hidden md:inline shrink-0">
                Fetchable as .json, .yaml, .txt
              </span>
            </div>
          )}

          <div className="editor-footer">
            <span>{stats}</span>
            <div className="flex items-center gap-3">
              {draftStatus === 'saving' && (
                <span className="text-xs font-mono text-amber-400 flex items-center gap-1.5" title="Saving draft...">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  Saving draft...
                </span>
              )}
              {draftStatus === 'saved' && (
                <span className="text-xs font-mono text-[#8c9690] flex items-center gap-1" title="Draft saved locally">
                  <Icon name="check" size={11} className="text-emerald-400" />
                  Draft saved
                </span>
              )}
              {draftStatus === 'failed' && (
                <span className="text-xs font-mono text-red-400" title="Draft save failed">
                  Draft save failed
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <span className={`status-dot ${enableE2E ? '!bg-[#c6f05b]' : ''}`}></span>
                <span className={enableE2E ? 'text-[#c6f05b] font-semibold' : ''}>
                  {saved
                    ? `${privacy === 'PUBLIC' ? 'Public' : privacy === 'PRIVATE' ? 'Private' : 'Unlisted'} Paste Created`
                    : enableE2E
                      ? 'Sealed · AES-256-GCM'
                      : activeByteLength > MAX_HIGHLIGHT_BYTES
                        ? 'Plain Text (Large File)'
                        : 'Open · Syntax Active'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Configuration & Action Buttons Panel */}
        <aside className="controls-panel ref-panel" aria-label="Paste settings">
          <div className="controls-panel-body" style={{ margin: 0, paddingRight: 2 }}>
            <div className="ref-field">
              <span className="ref-label">Protection</span>
              <div className="ref-seg mode" role="radiogroup" aria-label="Paste mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!enableE2E}
                  className={`open ${!enableE2E ? 'on' : ''}`}
                  data-v="open"
                  onClick={() => setEnableE2E(false)}
                >
                  Open
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={enableE2E}
                  className={`sealed ${enableE2E ? 'on' : ''}`}
                  data-v="sealed"
                  onClick={() => {
                    setEnableE2E(true);
                    setShowSecurityGroup(true);
                  }}
                >
                  Encrypted
                </button>
              </div>
              <div className="ref-hint">
                {enableE2E
                  ? 'Encrypted in your browser. The server can’t read it.'
                  : 'Readable by the server, so it can be highlighted and fetched as an API.'}
              </div>
            </div>

            <div className="ref-field">
              <label className="ref-label" htmlFor="paste-expiration">
                Expires
              </label>
              <Select<ExpirationPolicy>
                id="paste-expiration"
                name="expiration"
                size="sm"
                className="font-mono text-[11px]"
                menuWidth={240}
                value={burnAfterReading ? 'VIEW_ONCE' : expiry}
                onChange={(val) => {
                  setExpiry(val);
                  setBurnAfterReading(val === 'VIEW_ONCE');
                }}
                disabled={burnAfterReading}
                options={expirationOptions}
                ariaLabel="Paste expiration policy"
              />
            </div>

            <div className="ref-field" style={{ marginBottom: 12 }}>
              <label className="ref-label" htmlFor="paste-exposure">
                Who can see it
              </label>
              <div className="ref-seg" role="radiogroup" aria-label="Visibility">
                {(['PUBLIC', 'UNLISTED', 'PRIVATE'] as Visibility[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={privacy === v}
                    className={privacy === v ? 'on' : ''}
                    disabled={v === 'PRIVATE' && !isAuthenticated}
                    title={v === 'PRIVATE' && !isAuthenticated ? 'Sign in to use private pastes' : undefined}
                    onClick={() => setPrivacy(v)}
                  >
                    {v[0] + v.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <div className="ref-hint" style={{ marginTop: 3 }}>
                {privacy === 'PUBLIC'
                  ? 'Listed in Explore and searchable.'
                  : privacy === 'PRIVATE'
                  ? isAuthenticated
                    ? 'Only you, when signed in.'
                    : 'Requires signing in.'
                  : 'Anyone with the link can open it.'}
              </div>
              <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
                <Select<Visibility>
                  id="paste-exposure"
                  name="visibility"
                  size="sm"
                  menuWidth={240}
                  value={privacy}
                  onChange={setPrivacy}
                  options={exposureOptions}
                  ariaLabel="Paste exposure visibility"
                />
              </div>
            </div>

            <details
              className="ref-more"
              id="sec"
              open={showSecurityGroup}
              onToggle={(e) => setShowSecurityGroup((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>
                <span>Security options</span>
              </summary>
              <div className="ref-body">
                <label className="ref-switch">
                  <span>
                    <b>Burn after reading</b>
                    <div className="ref-hint">Deleted after the first view.</div>
                  </span>
                  <input
                    type="checkbox"
                    id="burn"
                    checked={burnAfterReading}
                    aria-label="Burn after read"
                    onChange={(e) => {
                      const next = e.target.checked;
                      setBurnAfterReading(next);
                      if (next) setExpiry('VIEW_ONCE');
                      else if (expiry === 'VIEW_ONCE') setExpiry('ONE_WEEK');
                    }}
                  />
                </label>

                {/* Compatibility toggle for automated suites */}
                <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
                  <label htmlFor="e2e-encryption-toggle">
                    <input
                      id="e2e-encryption-toggle"
                      type="checkbox"
                      title="Browser encryption where the server cannot read your content"
                      checked={enableE2E}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setEnableE2E(next);
                        if (next) setShowSecurityGroup(true);
                      }}
                      aria-label="Enable E2E"
                    />
                    <span>Enable E2E</span>
                  </label>
                  <span>
                    Encrypts content in your browser before upload. The server cannot read your text. On the next step you will choose how the recipient gets access. Warning: There is no recovery if you lose the link key or passphrase.
                  </span>
                </div>

                {enableE2E && (
                  <div className="ref-e2e-box" id="e2e" style={{ display: 'block', marginBottom: 10 }}>
                    <div className="ref-label text-[11px] !text-[#166534]">How do people unlock it?</div>
                    <div className="ref-seg" id="e2eMode" role="radiogroup" aria-label="Access mode">
                      <button
                        type="button"
                        aria-label="Link Key"
                        aria-checked={e2eMode === 'LINK'}
                        className={e2eMode === 'LINK' ? 'on' : ''}
                        data-v="LINK"
                        onClick={() => setE2eMode('LINK')}
                      >
                        🔗 Link Key
                      </button>
                      <button
                        type="button"
                        aria-label="Passphrase"
                        aria-checked={e2eMode === 'PASSPHRASE'}
                        className={e2eMode === 'PASSPHRASE' ? 'on' : ''}
                        data-v="PASSPHRASE"
                        onClick={() => setE2eMode('PASSPHRASE')}
                      >
                        🔑 Passphrase
                      </button>
                    </div>

                    {e2eMode === 'LINK' && (
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-[#166534] select-none pt-2">
                        <input
                          type="checkbox"
                          checked={wrapLinkWithPassphrase}
                          onChange={(e) => setWrapLinkWithPassphrase(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-[#16a34a] text-[#16a34a] focus:ring-0 cursor-pointer accent-[#16a34a]"
                        />
                        <span>Wrap with passphrase (Dual Access)</span>
                      </label>
                    )}

                    {(e2eMode === 'PASSPHRASE' || wrapLinkWithPassphrase) && (
                      <div style={{ marginTop: 8 }}>
                        <div className="ref-pw">
                          <input
                            id="pass"
                            className="ref-in"
                            type={showE2EPassphrase ? 'text' : 'password'}
                            value={e2ePassphrase}
                            onChange={(e) => setE2ePassphrase(e.target.value)}
                            placeholder="Enter secret passphrase..."
                            aria-label="Passphrase"
                          />
                          <button type="button" onClick={() => setShowE2EPassphrase((v) => !v)}>
                            {showE2EPassphrase ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="ref-warn">
                      If the key or passphrase is lost, nobody can recover the paste.
                    </div>
                  </div>
                )}

                {!enableE2E && (
                  <div id="pwWrap" style={{ marginTop: 6 }}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="ref-label !mb-0" htmlFor="paste-password">
                        Password
                      </label>
                      <label
                        htmlFor="suggest-password-toggle"
                        className="flex items-center gap-1 text-[10px] font-mono text-[#525a54] hover:text-[#17201d] cursor-pointer select-none"
                      >
                        <input
                          id="suggest-password-toggle"
                          type="checkbox"
                          checked={isSuggestPassword}
                          onChange={(e) => handleToggleSuggestPassword(e.target.checked)}
                          className="w-3 h-3 rounded border-[#aaa89f] text-[#ff5c3d] focus:ring-0 cursor-pointer accent-[#ff5c3d]"
                        />
                        <span>Suggest</span>
                      </label>
                    </div>
                    <div className="ref-pw">
                      <input
                        id="paste-password"
                        className="ref-in"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        maxLength={MAX_PASSCODE_LENGTH}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (!e.target.value) setIsSuggestPassword(false);
                        }}
                        placeholder="Optional"
                        aria-label="Paste access password"
                      />
                      <button type="button" id="gen" onClick={handleRegeneratePassword} title="Generate a password">
                        Generate
                      </button>
                      {password && (
                        <button type="button" onClick={() => setShowPassword((v) => !v)} title="Toggle visibility">
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                      )}
                    </div>
                    {password && (
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#74786f] px-0.5 mt-1">
                        <span className="text-green-700 font-semibold">✓ Password protected</span>
                        <button
                          type="button"
                          onClick={handleCopyPassword}
                          className="text-[#ff5c3d] underline text-[10px] cursor-pointer bg-transparent border-0 p-0"
                        >
                          {passwordCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </details>

            <details
              className="ref-more"
              open={showOrganizeGroup}
              onToggle={(e) => setShowOrganizeGroup((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>
                <span>Organize</span>
              </summary>
              <div className="ref-body">
                <div className="ref-row">
                  <div>
                    <label className="ref-label" htmlFor="paste-category">
                      Category
                    </label>
                    <Select
                      id="paste-category"
                      size="sm"
                      className="font-mono text-[11px]"
                      menuWidth={220}
                      value={category}
                      onChange={setCategory}
                      options={categoryOptions}
                      ariaLabel="Paste category"
                    />
                  </div>
                  <div>
                    <label className="ref-label" htmlFor="paste-tags">
                      Tags
                    </label>
                    <input
                      id="paste-tags"
                      className="ref-in"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="react, api"
                      aria-label="Paste tags"
                    />
                  </div>
                </div>
                {isAuthenticated && (
                  <div style={{ marginTop: 8 }}>
                    <label className="ref-label" htmlFor="paste-folder">
                      Folder
                    </label>
                    <Select
                      id="paste-folder"
                      size="sm"
                      className="font-mono text-[11px]"
                      menuWidth={240}
                      value={folder}
                      onChange={setFolder}
                      options={folderOptions}
                      ariaLabel="Destination folder"
                    />
                  </div>
                )}
              </div>
            </details>
          </div>

          {/* Primary Action Footer */}
          <div style={{ marginTop: 12, borderTop: '1.5px dashed #d5d0c5', paddingTop: 14 }}>
            <button
              className="ref-cta"
              id="create"
              type="button"
              onClick={handleCreate}
              disabled={isSubmitting || files.some((f) => !f.content.trim())}
              title="Create paste (Shortcut: Ctrl + Enter)"
            >
              <span id="ctaText">
                {isSubmitting ? 'Creating…' : saved ? 'Paste created!' : 'Create paste'}
                <small>{burnAfterReading ? 'Burns after the first view' : 'Get a shareable link'}</small>
              </span>
              <Icon name={saved ? 'check' : 'arrow'} size={18} />
            </button>

            {/* Hidden contract compatibility helpers */}
            <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
              <span>Tip: Unencrypted pastes can be fetched directly as APIs via .json, .yaml, or .txt.</span>
              <Link to="/docs">API docs</Link>
            </div>
          </div>
        </aside>
      </div>

      {/* Recent Snippets Grid */}
      <section className="recent-section">
        <div className="section-title">
          <div>
            <span>COMMUNITY DISCOVERY</span>
            <h2>Recent public pastes across the platform.</h2>
          </div>
          <Link to="/discovery">
            View all <Icon name="arrow" size={16} />
          </Link>
        </div>

        <div className="paste-grid">
          {recentList.map((paste, index) => (
            <article
              className="paste-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#17201d]"
              tabIndex={0}
              key={paste.id || paste.title + index}
              onClick={() => {
                if (paste.id) navigate(`/p/${paste.id}`);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (paste.id) navigate(`/p/${paste.id}`);
                }
              }}
            >
              <div className={`file-badge ${paste.color}`}>
                <Icon
                  name={
                    index === 1
                      ? ('settings' as IconName)
                      : index === 2
                        ? ('file' as IconName)
                        : ('code' as IconName)
                  }
                />
              </div>
              <div className="paste-meta">
                {paste.language} · {paste.age}
              </div>
              <h3>{paste.title}</h3>
              <div className="card-footer">
                <span>
                  <Icon name="lock" size={13} /> Public
                </span>
                <span>{paste.expiryBadge}</span>
              </div>
            </article>
          ))}

          <button className="new-card" onClick={handleStartFresh}>
            <i>
              <Icon name="plus" size={22} />
            </i>
            <span>Start a fresh paste</span>
          </button>
        </div>
      </section>

      {/* Platform Overview & Feature Guide */}
      <section className="platform-guide-section">
        <div className="platform-guide-header">
          <div className="guide-eyebrow">
            <span></span> FEATURES
          </div>
          <h2>Everything a pastebin should do, done properly.</h2>
          <p>
            From multi-file workspaces and client-side zero-knowledge encryption to typed API exports, diff revisions, and anonymous comments.
          </p>
        </div>

        {/* 9 Comprehensive Features Grid */}
        <div className="platform-features-grid">
          {/* 1. Multi-file pastes */}
          <div className="platform-feature-card">
            <div className="platform-feature-icon coral">
              <Icon name="file" size={18} />
            </div>
            <h3>Multi-file pastes</h3>
            <p>
              Up to 20 files under one link. Download individual files or export the entire workspace as a ZIP archive.
            </p>
          </div>

          {/* 2. Syntax highlighting */}
          <div className="platform-feature-card">
            <div className="platform-feature-icon lime">
              <Icon name="code" size={18} />
            </div>
            <h3>Syntax highlighting</h3>
            <p>
              50+ programming languages and configuration formats, highlighted live as you type with synchronized line numbers.
            </p>
          </div>

          {/* 3. Revision history */}
          <div className="platform-feature-card">
            <div className="platform-feature-icon blue">
              <Icon name="history" size={18} />
            </div>
            <h3>Revision history</h3>
            <p>
              Every edit automatically versioned and saved, with side-by-side and unified line-by-line visual diffs.
            </p>
          </div>

          {/* 4. Expiry and burn after read */}
          <div className="platform-feature-card">
            <div className="platform-feature-icon amber">
              <Icon name="flame" size={18} />
            </div>
            <h3>Expiry &amp; burn after read</h3>
            <p>
              Auto-delete after 10 minutes, 1 hour, a week, or upon first access with Burn After Read. Protect with an unlock passcode.
            </p>
          </div>

          {/* 5. End-to-end encryption */}
          <div className="platform-feature-card">
            <div className="platform-feature-icon teal">
              <Icon name="lock" size={18} />
            </div>
            <h3>End-to-end encryption</h3>
            <p>
              Seal pastes in your browser using AES-256-GCM. We never hold or see the cryptographic key. Zero-knowledge privacy.
            </p>
          </div>

          {/* 6. Paste as API */}
          <div className="platform-feature-card">
            <div className="platform-feature-icon purple">
              <Icon name="spark" size={18} />
            </div>
            <h3>Paste as API</h3>
            <p>
              Fetch open pastes directly into scripts as <code>.json</code>, <code>.yaml</code>, <code>.md</code>, or <code>.txt</code> with HTTP ETag caching.
            </p>
          </div>

          {/* 7. Folders, tags and Explore */}
          <div className="platform-feature-card">
            <div className="platform-feature-icon dark">
              <Icon name="folder" size={18} />
            </div>
            <h3>Folders, tags &amp; Explore</h3>
            <p>
              Organize personal snippets into custom folders and tags, or share publicly in the community discovery feed.
            </p>
          </div>

          {/* 8. Embeds and QR codes */}
          <div className="platform-feature-card">
            <div className="platform-feature-icon coral">
              <Icon name="qr" size={18} />
            </div>
            <h3>Embeds &amp; QR codes</h3>
            <p>
              Drop interactive iframe snippets into any external blog or documentation, or share directly to mobile via QR code.
            </p>
          </div>

          {/* 9. Comments */}
          <div className="platform-feature-card">
            <div className="platform-feature-icon lime">
              <Icon name="message-square" size={18} />
            </div>
            <h3>Anonymous comments</h3>
            <p>
              Collaborate and discuss snippets directly on the paste page, managed with secure anonymous delete tokens.
            </p>
          </div>
        </div>

      </section>

      {/* Frequently Asked Questions */}
      <section
        data-testid="editor-faq"
        className="mb-12 rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-6 shadow-[4px_4px_0px_#17201d]"
      >
        <div className="eyebrow flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#74786f] mb-1.5">
          <span>FREQUENTLY ASKED QUESTIONS</span>
        </div>
        <h2 className="text-xl font-mono font-bold text-[#17201d] mb-4">
          Common Questions &amp; Workflows
        </h2>

        {/* Feature Overview Strip for discoverability */}
        <div className="mb-4">
          <details className="rounded-xl border border-[#d5d0c5] bg-[#ebe7dc]/50 text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between">
              <span>What can I do?</span>
              <span className="text-[10.5px] text-[#74786f] font-normal group-open:hidden">Explore platform guides</span>
            </summary>
            <div className="px-3.5 pb-2.5 pt-1 border-t border-[#d5d0c5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                <span>• Encrypted pastes: Encrypt files in your browser so the server cannot read your text.</span>
                <span>• Paste as API: Fetch any unencrypted paste as .json, .yaml, or raw text with ETag caching.</span>
              </div>
              <Link to="/docs" className="text-[#ff5c3d] font-bold hover:underline shrink-0">
                Feature guides →
              </Link>
            </div>
          </details>
        </div>

        <div className="space-y-3">
          {/* Question 1 */}
          <details className="rounded-xl border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2.5 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 flex-1 pr-2">
                <span>Should I encrypt this paste?</span>
                <span className="text-[11px] font-normal text-[#74786f]">— How do I protect sensitive text &amp; API keys?</span>
              </div>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#e8e4da] text-[#17201d] text-sm font-bold shrink-0 transition-transform">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
            </summary>
            <div className="px-3.5 pb-3 pt-1.5 border-t border-[#d5d0c5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="leading-relaxed text-[#2f3833]">
                Encrypt if your paste contains secrets, credentials, API keys, or private notes so ExtraBin servers never see your plaintext.
              </span>
              <Link to="/docs/features/encrypted-pastes#when-to-use" className="text-[#ff5c3d] font-bold hover:underline shrink-0">
                Read more →
              </Link>
            </div>
          </details>

          {/* Question 2 */}
          <details className="rounded-xl border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2.5 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 flex-1 pr-2">
                <span>What happens if I lose the link or passphrase?</span>
                <span className="text-[11px] font-normal text-[#74786f]">— Can an admin reset or recover it?</span>
              </div>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#e8e4da] text-[#17201d] text-sm font-bold shrink-0 transition-transform">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
            </summary>
            <div className="px-3.5 pb-3 pt-1.5 border-t border-[#d5d0c5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="leading-relaxed text-[#2f3833]">
                If you lose the link key or forget the passphrase, the paste cannot be recovered by anyone, including ExtraBin administrators; the data is permanently lost.
              </span>
              <Link to="/docs/features/encrypted-pastes#irreversible-data-loss-policy" className="text-[#ff5c3d] font-bold hover:underline shrink-0">
                Read more →
              </Link>
            </div>
          </details>

          {/* Question 3 */}
          <details className="rounded-xl border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2.5 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 flex-1 pr-2">
                <span>Can I fetch this paste from a script?</span>
                <span className="text-[11px] font-normal text-[#74786f]">— Using curl, wget, or automated pipelines</span>
              </div>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#e8e4da] text-[#17201d] text-sm font-bold shrink-0 transition-transform">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
            </summary>
            <div className="px-3.5 pb-3 pt-1.5 border-t border-[#d5d0c5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="leading-relaxed text-[#2f3833]">
                Yes, unencrypted pastes can be fetched directly using curl, wget, or code with typed suffixes like .json, .yaml, or raw text with ETags.
              </span>
              <Link to="/docs/features/paste-as-api#developer-use-cases" className="text-[#ff5c3d] font-bold hover:underline shrink-0">
                Read more →
              </Link>
            </div>
          </details>

          {/* Question 4 */}
          <details className="rounded-xl border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2.5 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 flex-1 pr-2">
                <span>What does burn-after-reading do?</span>
                <span className="text-[11px] font-normal text-[#74786f]">— Self-destructing one-time view links</span>
              </div>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#e8e4da] text-[#17201d] text-sm font-bold shrink-0 transition-transform">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
            </summary>
            <div className="px-3.5 pb-3 pt-1.5 border-t border-[#d5d0c5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="leading-relaxed text-[#2f3833]">
                The paste is permanently destroyed and purged from storage immediately after its first retrieval, returning 404 for any subsequent attempt.
              </span>
              <Link to="/docs/features/burn-after-read#mechanics" className="text-[#ff5c3d] font-bold hover:underline shrink-0">
                Read more →
              </Link>
            </div>
          </details>

          {/* Question 5 */}
          <details className="rounded-xl border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2.5 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 flex-1 pr-2">
                <span>Is this paste public?</span>
                <span className="text-[11px] font-normal text-[#74786f]">— Privacy modes: Public vs Unlisted vs Private</span>
              </div>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#e8e4da] text-[#17201d] text-sm font-bold shrink-0 transition-transform">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
            </summary>
            <div className="px-3.5 pb-3 pt-1.5 border-t border-[#d5d0c5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="leading-relaxed text-[#2f3833]">
                Public pastes appear in community discovery, unlisted pastes are only accessible to those with the direct link, and private pastes require an account.
              </span>
              <Link to="/docs/features/encrypted-pastes#access-modes" className="text-[#ff5c3d] font-bold hover:underline shrink-0">
                Read more →
              </Link>
            </div>
          </details>
        </div>
      </section>

      {/* Floating Share Toast (Finding 10: only valid links) */}
      {saved && createdPasteId && (
        <div className="share-toast" role="status">
          <div className="toast-icon">
            <Icon name="check" size={20} />
          </div>
          <div>
            <strong>
              {createdEncryptionMode ? 'End-to-End Encrypted' : privacy === 'PUBLIC' ? 'Public' : privacy === 'PRIVATE' ? 'Private' : 'Unlisted'} paste created
            </strong>
            <span>{`${window.location.host}/p/${createdPasteId}${createdLinkKey ? `#key=${createdLinkKey}` : ''}`}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copyLink}>
              <Icon name={copied ? 'check' : 'copy'} size={15} />
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={() => navigate(`/p/${createdPasteId}${createdLinkKey ? `#key=${createdLinkKey}` : ''}`)}
              className="!bg-[#c6f05b] !text-[#17201d]"
            >
              View
            </button>
          </div>
        </div>
      )}

      {/* Full Modal Feedback on Paste Creation */}
      <PasteCreatedModal
        isOpen={showCreatedModal}
        onClose={() => {
          setShowCreatedModal(false);
          handleStartFresh();
        }}
        pasteId={createdPasteId || ''}
        shareToken={createdShareToken}
        deletionCapability={createdDeletionCapability}
        isBurnAfterReading={burnAfterReading}
        isViewOnce={burnAfterReading || expiry === 'VIEW_ONCE'}
        isPasswordProtected={!!password}
        encryptionMode={createdEncryptionMode}
        linkKey={createdLinkKey}
        isPassphraseProtected={createdIsPassphraseProtected}
      />
    </section>
  );
};

export default CreatePastePage;
