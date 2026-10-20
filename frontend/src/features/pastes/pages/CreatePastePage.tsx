import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, IconName } from '../../../components/ui/PaperIcon';
import { Select, SelectOption } from '../../../components/ui/Select';
import { pasteApi } from '../api/pasteApi';
import { discoveryApi } from '../../discovery/api/discoveryApi';
import { useAuth } from '../../auth/context/AuthContext';
import { detectLanguageFromCode } from '../../../lib/syntax/shiki';
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
}

export function detectLanguageFromFilename(filename: string): string | null {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx < 0 || dotIdx === filename.length - 1) return null;
  const ext = filename.substring(dotIdx + 1).toLowerCase();
  switch (ext) {
    case 'java': return 'java';
    case 'js': case 'mjs': case 'cjs': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'py': return 'python';
    case 'html': case 'htm': return 'html';
    case 'css': return 'css';
    case 'json': return 'json';
    case 'sql': return 'sql';
    case 'md': case 'markdown': return 'markdown';
    case 'rs': return 'rust';
    case 'go': return 'go';
    case 'c': case 'h': return 'c';
    case 'cpp': case 'hpp': case 'cc': case 'cxx': return 'cpp';
    case 'cs': return 'csharp';
    case 'php': return 'php';
    case 'rb': return 'ruby';
    case 'yml': case 'yaml': return 'yaml';
    case 'xml': return 'xml';
    case 'sh': case 'bash': case 'zsh': return 'bash';
    case 'kt': case 'kts': return 'kotlin';
    default: return null;
  }
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
    },
  ]);
  const [activeFileId, setActiveFileId] = useState<string>('f1');

  const activeFileIndex = Math.max(0, files.findIndex((f) => f.id === activeFileId));
  const activeFile = files[activeFileIndex] || files[0];
  const content = activeFile.content;
  const language = activeFile.language;

  const setContent = (newContent: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFile.id ? { ...f, content: newContent } : f))
    );
  };

  const setLanguage = (newLang: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFile.id ? { ...f, language: newLang } : f))
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

  const expirationOptions: SelectOption<ExpirationPolicy>[] = useMemo(() => [
    { value: 'TEN_MINUTES', label: '10 Minutes' },
    { value: 'ONE_HOUR', label: '1 Hour' },
    { value: 'ONE_DAY', label: '1 Day' },
    { value: 'ONE_WEEK', label: '1 Week (Default)' },
    { value: 'NEVER', label: 'Never', description: 'Paste remains online indefinitely' },
  ], []);

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
              {/* E2E / Open Mode Segmented Toggle */}
              <div
                className="editor-mode-toggle"
                role="radiogroup"
                aria-label="Paste encryption mode"
              >
                <button
                  type="button"
                  onClick={() => setEnableE2E(false)}
                  className={`editor-mode-btn ${!enableE2E ? 'active-open' : ''}`}
                  title="Open paste — Syntax highlighted & directly fetchable via API"
                >
                  <Icon name="code" size={12} />
                  <span className="hidden sm:inline">Open</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEnableE2E(true);
                    setShowSecurityGroup(true);
                  }}
                  className={`editor-mode-btn ${enableE2E ? 'active-sealed' : ''}`}
                  title="Encrypted paste — Browser AES-256-GCM sealed before upload"
                >
                  <Icon name="lock" size={12} />
                  <span className="hidden sm:inline">Encrypted</span>
                </button>
              </div>

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
        <aside className="controls-panel">
          {/* Top Action: Start Fresh Paste */}
          <button
            type="button"
            onClick={handleStartFresh}
            className="start-fresh-button flex-shrink-0"
            title="Clear all fields and start a new paste"
          >
            <Icon name="plus" size={13} />
            <span>Start fresh paste</span>
          </button>

          {/* Scrollable Settings Body */}
          <div className="controls-panel-body">
            <div className="flex flex-col gap-2.5 pt-0.5">
              {/* 🔴 Group 1: Basics (Expiration & Exposure side by side) */}
              <div className="settings-accordion-group">
                <button
                  type="button"
                  onClick={() => setShowBasicsGroup(!showBasicsGroup)}
                  className="settings-accordion-header"
                  aria-expanded={showBasicsGroup}
                >
                  <div className="settings-accordion-title">
                    <span className="settings-group-dot basics"></span>
                    <span>Basics</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(expiry !== 'ONE_WEEK' || privacy !== 'UNLISTED') && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#ff5c3d]/15 text-[#ff5c3d]">
                        Custom
                      </span>
                    )}
                    <Icon
                      name="chevron-down"
                      size={12}
                      className={`transition-transform duration-200 text-[#74786f] ${showBasicsGroup ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {showBasicsGroup && (
                  <div className="settings-accordion-body">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Expiration */}
                      <div className="controls-section">
                        <label className="control-label text-[10px]" htmlFor="paste-expiration">
                          <span>Expiration</span>
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

                      {/* Exposure */}
                      <div className="controls-section">
                        <label className="control-label text-[10px]" htmlFor="paste-exposure">
                          <span>Exposure</span>
                        </label>
                        <Select<Visibility>
                          id="paste-exposure"
                          name="visibility"
                          size="sm"
                          className="font-mono text-[11px]"
                          menuWidth={240}
                          value={privacy}
                          onChange={setPrivacy}
                          options={exposureOptions}
                          ariaLabel="Paste exposure visibility"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 🟢 Group 2: Security (Burn after read, E2E Encryption, Password) */}
              <div className="settings-accordion-group">
                <button
                  type="button"
                  onClick={() => setShowSecurityGroup(!showSecurityGroup)}
                  className="settings-accordion-header"
                  aria-expanded={showSecurityGroup}
                >
                  <div className="settings-accordion-title">
                    <span className="settings-group-dot security"></span>
                    <span>Security</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(burnAfterReading || enableE2E || password.length > 0) && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#16a34a]/15 text-[#16a34a]">
                        Protected
                      </span>
                    )}
                    <Icon
                      name="chevron-down"
                      size={12}
                      className={`transition-transform duration-200 text-[#74786f] ${showSecurityGroup ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                <div className={`settings-accordion-body ${!showSecurityGroup ? 'collapsed' : ''}`}>
                  {/* Burn After Read Toggle Card */}
                  <div
                    className={`burn-toggle-card ${burnAfterReading ? 'active' : ''}`}
                    onClick={() => {
                      const next = !burnAfterReading;
                      setBurnAfterReading(next);
                      if (next) setExpiry('VIEW_ONCE');
                      else if (expiry === 'VIEW_ONCE') setExpiry('ONE_WEEK');
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`p-1 rounded-md ${burnAfterReading ? 'bg-[#ff5c3d]/15 text-[#ff5c3d]' : 'bg-[#17201d]/5 text-[#74786f]'}`}>
                        <Icon name="flame" size={14} />
                      </span>
                      <div>
                        <span className="block text-[11px] font-bold text-[#17201d]">Burn after read</span>
                        <span className="block text-[9.5px] font-mono text-[#74786f]">
                          {burnAfterReading ? '🔥 Purges on first view' : 'Auto-delete after 1st view'}
                        </span>
                      </div>
                    </div>
                    <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={burnAfterReading}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setBurnAfterReading(checked);
                          if (checked) setExpiry('VIEW_ONCE');
                          else if (expiry === 'VIEW_ONCE') setExpiry('ONE_WEEK');
                        }}
                        aria-label="Burn after read"
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  {/* End-to-End Encryption Section */}
                  <div className="controls-section border-t border-[#e5e0d5] pt-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="control-label !mb-0 cursor-pointer text-[10px]" htmlFor="e2e-encryption-toggle">
                        <span className="flex items-center gap-1.5">
                          <Icon name="lock" size={12} className="text-[#16a34a]" />
                          <span className="font-bold text-[#166534]">End-to-End Encryption</span>
                        </span>
                      </label>
                      <label htmlFor="e2e-encryption-toggle" className="flex items-center gap-1.5 text-[11px] font-mono text-[#525a54] hover:text-[#17201d] cursor-pointer select-none">
                        <input
                          id="e2e-encryption-toggle"
                          type="checkbox"
                          title="Browser encryption where the server cannot read your content"
                          checked={enableE2E}
                          onChange={(e) => setEnableE2E(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-[#aaa89f] text-[#16a34a] focus:ring-0 cursor-pointer accent-[#16a34a]"
                        />
                        <span className="font-semibold text-[10.5px]">Enable E2E</span>
                      </label>
                    </div>
                    <p className="text-[10px] font-mono text-[#525a54] mt-0.5 mb-1.5 leading-relaxed">
                      Encrypts content in your browser before upload. The server cannot read your text. On the next step you will choose how the recipient gets access. Warning: There is no recovery if you lose the link key or passphrase.
                    </p>

                    {enableE2E && (
                      <div className="space-y-2 p-2 rounded-lg border border-[#86efac] bg-[#f0fdf4] text-xs font-mono">
                        <div className="text-[10.5px] text-[#15803d] leading-relaxed">
                          Zero-knowledge client-side encryption. Data is encrypted in your browser before upload.
                        </div>

                        <div className="space-y-1">
                          <span className="text-[9.5px] uppercase font-bold text-[#166534]">Access Mode</span>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setE2eMode('LINK')}
                              className={`p-1.5 rounded border text-left text-[10.5px] transition-all ${e2eMode === 'LINK'
                                ? 'bg-[#dcfce7] border-[#16a34a] text-[#14532d] font-bold shadow-sm'
                                : 'bg-white border-[#bbf7d0] text-[#525a54] hover:bg-[#f0fdf4]'
                                }`}
                            >
                              <div>🔗 Link Key</div>
                              <div className="text-[9px] font-normal opacity-75">Key in URL hash</div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setE2eMode('PASSPHRASE')}
                              className={`p-1.5 rounded border text-left text-[10.5px] transition-all ${e2eMode === 'PASSPHRASE'
                                ? 'bg-[#dcfce7] border-[#16a34a] text-[#14532d] font-bold shadow-sm'
                                : 'bg-white border-[#bbf7d0] text-[#525a54] hover:bg-[#f0fdf4]'
                                }`}
                            >
                              <div>🔑 Passphrase</div>
                              <div className="text-[9px] font-normal opacity-75">Password required</div>
                            </button>
                          </div>
                        </div>

                        {e2eMode === 'LINK' && (
                          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-[#166534] select-none pt-0.5">
                            <input
                              type="checkbox"
                              checked={wrapLinkWithPassphrase}
                              onChange={(e) => setWrapLinkWithPassphrase(e.target.checked)}
                              className="w-3 h-3 rounded border-[#16a34a] text-[#16a34a] focus:ring-0 cursor-pointer accent-[#16a34a]"
                            />
                            <span>Wrap with passphrase (Dual Access)</span>
                          </label>
                        )}

                        {(e2eMode === 'PASSPHRASE' || (e2eMode === 'LINK' && wrapLinkWithPassphrase)) && (
                          <div className="space-y-1 pt-1 border-t border-[#86efac]/50">
                            <div className="flex items-center justify-between text-[10px] text-[#166534]">
                              <span>{e2eMode === 'PASSPHRASE' ? 'Required Passphrase' : 'Dual Passphrase'}</span>
                              <button
                                type="button"
                                onClick={() => setShowE2EPassphrase(!showE2EPassphrase)}
                                className="underline hover:text-[#14532d]"
                              >
                                {showE2EPassphrase ? 'Hide' : 'Show'}
                              </button>
                            </div>
                            <input
                              type={showE2EPassphrase ? 'text' : 'password'}
                              value={e2ePassphrase}
                              onChange={(e) => setE2ePassphrase(e.target.value)}
                              placeholder="Enter secret passphrase..."
                              className="controls-input font-mono text-[11px] !border-[#86efac] !bg-white !py-1"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Password Protection with Auto-generate / Suggest Password */}
                  {!enableE2E ? (
                    <div className="controls-section border-t border-[#e5e0d5] pt-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="control-label !mb-0 text-[10px]" htmlFor="paste-password">
                          <span className="flex items-center gap-1.5">
                            <Icon name="key" size={11} />
                            <span>Password</span>
                          </span>
                        </label>

                        <label
                          htmlFor="suggest-password-toggle"
                          className="flex items-center gap-1.5 text-[10.5px] font-mono text-[#525a54] hover:text-[#17201d] cursor-pointer select-none"
                          title="Tick to automatically generate a secure password"
                        >
                          <input
                            id="suggest-password-toggle"
                            type="checkbox"
                            checked={isSuggestPassword}
                            onChange={(e) => handleToggleSuggestPassword(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-[#aaa89f] text-[#ff5c3d] focus:ring-0 cursor-pointer accent-[#ff5c3d]"
                          />
                          <span className="font-semibold text-[10px]">Suggest password</span>
                        </label>
                      </div>

                      <div className="relative">
                        <input
                          id="paste-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          className={`controls-input ${password ? 'pr-20' : ''} font-mono text-[11.5px] !py-1.5`}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (!e.target.value) setIsSuggestPassword(false);
                          }}
                          maxLength={MAX_PASSCODE_LENGTH}
                          aria-label="Paste access password"
                          placeholder="Optional passcode to unlock..."
                        />

                        {password && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {isSuggestPassword && (
                              <button
                                type="button"
                                onClick={handleRegeneratePassword}
                                className="p-1 rounded text-[#74786f] hover:text-[#ff5c3d] transition-colors"
                                title="Generate another password"
                              >
                                <Icon name="refresh" size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleCopyPassword}
                              className="p-1 rounded text-[#74786f] hover:text-[#17201d] transition-colors"
                              title={passwordCopied ? 'Copied!' : 'Copy password'}
                            >
                              <Icon name={passwordCopied ? 'check' : 'copy'} size={13} className={passwordCopied ? 'text-green-600' : ''} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="p-1 rounded text-[#74786f] hover:text-[#17201d] transition-colors"
                              title={showPassword ? 'Hide password' : 'Show password'}
                            >
                              <Icon name={showPassword ? 'eye-off' : 'eye'} size={13} />
                            </button>
                          </div>
                        )}
                      </div>

                      {password && (
                        <div className="flex items-center justify-between text-[9.5px] font-mono text-[#74786f] px-0.5">
                          <span className="flex items-center gap-1 text-green-700 font-semibold">
                            <span>✓ Protected</span>
                            {isSuggestPassword && <span className="text-[#74786f] font-normal">(suggested)</span>}
                          </span>
                          {passwordCopied && <span className="text-green-700 font-bold animate-pulse">Copied!</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="controls-section opacity-75 border-t border-[#e5e0d5] pt-1.5">
                      <div className="text-[10px] font-mono text-[#74786f] p-1.5 bg-[#f4f2ea] rounded">
                        🔒 Passcode disabled while E2E is active.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 🟣 Group 3: Organize (Category & Tags side by side, Folder) */}
              <div className="settings-accordion-group">
                <button
                  type="button"
                  onClick={() => setShowOrganizeGroup(!showOrganizeGroup)}
                  className="settings-accordion-header"
                  aria-expanded={showOrganizeGroup}
                >
                  <div className="settings-accordion-title">
                    <span className="settings-group-dot organize"></span>
                    <span>Organize</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(category !== 'none' || tags.trim().length > 0 || folder !== 'root') && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#8b5cf6]/15 text-[#8b5cf6]">
                        Tagged
                      </span>
                    )}
                    <Icon
                      name="chevron-down"
                      size={12}
                      className={`transition-transform duration-200 text-[#74786f] ${showOrganizeGroup ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {showOrganizeGroup && (
                  <div className="settings-accordion-body">
                    {/* Category & Tags Row side by side */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="controls-section">
                        <label className="control-label text-[10px]" htmlFor="paste-category">
                          <span>Category</span>
                        </label>
                        <Select
                          id="paste-category"
                          size="sm"
                          className="font-mono text-[11px]"
                          menuWidth={240}
                          value={category}
                          onChange={setCategory}
                          options={categoryOptions}
                          ariaLabel="Paste category"
                        />
                      </div>

                      <div className="controls-section">
                        <label className="control-label text-[10px]" htmlFor="paste-tags">
                          <span>Tags</span>
                        </label>
                        <input
                          id="paste-tags"
                          type="text"
                          className="controls-input compact font-mono text-[11px] !py-1.5"
                          value={tags}
                          onChange={(e) => setTags(e.target.value)}
                          placeholder="react, api..."
                          aria-label="Paste tags"
                        />
                      </div>
                    </div>

                    {/* Folder (if authenticated) */}
                    {isAuthenticated && (
                      <div className="controls-section border-t border-[#e5e0d5] pt-2">
                        <label className="control-label text-[10px]" htmlFor="paste-folder">
                          <span>Folder</span>
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
                )}
              </div>
            </div>
          </div>

          {/* Primary Action: Permanently Pinned Footer */}
          <div className="controls-panel-footer">
            <button
              type="button"
              className="create-button-full"
              onClick={handleCreate}
              disabled={isSubmitting || files.some((f) => !f.content.trim())}
              title="Create paste (Shortcut: Ctrl + Enter)"
            >
              <div>
                <span className="block leading-tight font-bold text-sm">
                  {isSubmitting ? 'Creating...' : saved ? 'Paste created!' : 'Create paste'}
                </span>
                <span className="text-[10px] font-mono opacity-80 font-normal">
                  {burnAfterReading ? '🔥 Burn on read active' : 'Save & get shareable link'}
                </span>
              </div>
              <i>{saved ? <Icon name="check" size={18} /> : <Icon name="arrow" size={18} />}</i>
            </button>
            <div className="text-center text-[10px] font-mono text-[#74776f]">
              Keyboard shortcut: <kbd className="font-bold px-1.5 py-0.5 rounded border border-[#d5d0c5] bg-white">Ctrl + Enter</kbd>
            </div>
            <div className="text-center text-[9.5px] font-mono text-[#74786f] pt-1 border-t border-[#e5e0d5]">
              Tip: Unencrypted pastes can be fetched directly as APIs via .json, .yaml, or .txt. <Link to="/docs" className="underline text-[#ff5c3d] hover:text-[#d9482b]">API docs</Link>
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

        {/* 3 Step Workflow */}
        <div className="platform-steps-strip">
          <div className="platform-step-item">
            <span className="platform-step-num">01</span>
            <div>
              <strong>Paste or Type Code</strong>
              <span>Drop code or configs into the editor. Auto-detection names and formats your syntax.</span>
            </div>
          </div>

          <div className="platform-step-item">
            <span className="platform-step-num">02</span>
            <div>
              <strong>Set Security & Expiry</strong>
              <span>Pick lifetime from 10 minutes to forever, or restrict exposure to Public, Unlisted, or Private.</span>
            </div>
          </div>

          <div className="platform-step-item">
            <span className="platform-step-num">03</span>
            <div>
              <strong>Share Instantly</strong>
              <span>Get an immediate short link ready for Slack, Discord, PRs, or developer forums.</span>
            </div>
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
          <details className="rounded-xl border border-[#d5d0c5] bg-white text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2.5 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between">
              <span>Should I encrypt this paste?</span>
              <span className="text-[10.5px] text-[#74786f] font-normal group-open:hidden">Click to expand</span>
            </summary>
            <div className="px-3.5 pb-3 pt-1.5 border-t border-[#d5d0c5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="leading-relaxed text-[#2f3833]">
                Encrypt if your paste contains secrets, credentials, or private keys so ExtraBin servers never see your plaintext.
              </span>
              <Link to="/docs/features/encrypted-pastes#when-to-use" className="text-[#ff5c3d] font-bold hover:underline shrink-0">
                Read more →
              </Link>
            </div>
          </details>

          {/* Question 2 */}
          <details className="rounded-xl border border-[#d5d0c5] bg-white text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2.5 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between">
              <span>What happens if I lose the link or passphrase?</span>
              <span className="text-[10.5px] text-[#74786f] font-normal group-open:hidden">Click to expand</span>
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
          <details className="rounded-xl border border-[#d5d0c5] bg-white text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2.5 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between">
              <span>Can I fetch this paste from a script?</span>
              <span className="text-[10.5px] text-[#74786f] font-normal group-open:hidden">Click to expand</span>
            </summary>
            <div className="px-3.5 pb-3 pt-1.5 border-t border-[#d5d0c5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="leading-relaxed text-[#2f3833]">
                Yes, unencrypted pastes can be fetched directly using typed suffixes like .json, .yaml, or raw text with ETags.
              </span>
              <Link to="/docs/features/paste-as-api#developer-use-cases" className="text-[#ff5c3d] font-bold hover:underline shrink-0">
                Read more →
              </Link>
            </div>
          </details>

          {/* Question 4 */}
          <details className="rounded-xl border border-[#d5d0c5] bg-white text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2.5 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between">
              <span>What does burn-after-reading do?</span>
              <span className="text-[10.5px] text-[#74786f] font-normal group-open:hidden">Click to expand</span>
            </summary>
            <div className="px-3.5 pb-3 pt-1.5 border-t border-[#d5d0c5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="leading-relaxed text-[#2f3833]">
                The paste is permanently destroyed and purged from storage after its first retrieval, returning 404 for any subsequent attempt.
              </span>
              <Link to="/docs/features/burn-after-read#mechanics" className="text-[#ff5c3d] font-bold hover:underline shrink-0">
                Read more →
              </Link>
            </div>
          </details>

          {/* Question 5 */}
          <details className="rounded-xl border border-[#d5d0c5] bg-white text-xs font-mono text-[#525a54] transition-all group p-1" open={false}>
            <summary className="px-3.5 py-2.5 font-bold text-[#17201d] cursor-pointer hover:text-[#ff5c3d] select-none flex items-center justify-between">
              <span>Is this paste public?</span>
              <span className="text-[10.5px] text-[#74786f] font-normal group-open:hidden">Click to expand</span>
            </summary>
            <div className="px-3.5 pb-3 pt-1.5 border-t border-[#d5d0c5]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="leading-relaxed text-[#2f3833]">
                Public pastes appear in community discovery, unlisted pastes are only accessible to those with the link, and private pastes require an account.
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
