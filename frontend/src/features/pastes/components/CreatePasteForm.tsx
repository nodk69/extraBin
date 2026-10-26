import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AlertCircle, Code, Eye, EyeOff, Globe, Lock, KeyRound, Share2, Timer, Sparkles, Columns, Flame, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PixelButton } from '../../../components/ui/PixelButton';
import { PixelInput } from '../../../components/ui/PixelInput';
import { NativeSelect } from '../../../components/ui/dropdown';
import { ToggleSwitch } from '../../../components/reactbits/ToggleSwitch';
import { triggerSuccessBurst } from '../../../lib/confetti';
import { pasteApi } from '../api/pasteApi';
import { CreatePastePayload, ExpirationPolicy, Visibility } from '../types/paste';
import { PasteCreatedModal } from './PasteCreatedModal';
import { ApiError } from '../../../lib/api-client/client';
import { useAuth } from '../../auth/context/AuthContext';
import { detectLanguageFromCode } from '../../../lib/syntax/shiki';
import { highlightCodeToLines } from '../../../lib/syntax/highlighter';

export const LANGUAGES = [
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'kotlin', label: 'Kotlin' },
];

export const EXPIRATION_OPTIONS: { value: ExpirationPolicy; label: string }[] = [
  { value: 'TEN_MINUTES', label: '10 Minutes' },
  { value: 'ONE_HOUR', label: '1 Hour' },
  { value: 'ONE_DAY', label: '1 Day' },
  { value: 'ONE_WEEK', label: '1 Week' },
  { value: 'NEVER', label: 'Never (Permanent)' },
];

export const CreatePasteForm: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC');
  const [expiration, setExpiration] = useState<ExpirationPolicy>('ONE_DAY');
  const [previousDuration, setPreviousDuration] = useState<ExpirationPolicy>('ONE_DAY');
  const [password, setPassword] = useState('');
  const [enablePassword, setEnablePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Honeypot field for bot suppression
  const [honeypot, setHoneypot] = useState('');

  // Copy-to-clipboard state
  const [hasCopied, setHasCopied] = useState(false);

  // Success link modal state
  const [createdPasteId, setCreatedPasteId] = useState<string | null>(null);
  const [deletionCapability, setDeletionCapability] = useState<string | null>(null);
  const [showCreatedModal, setShowCreatedModal] = useState(false);

  // Editor mode & auto-detection state
  const [editorMode, setEditorMode] = useState<'edit' | 'split' | 'preview'>('edit');
  const [detectedNotice, setDetectedNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus editor textarea on mount and mode changes
  useEffect(() => {
    if (editorMode !== 'preview') {
      textareaRef.current?.focus();
    }
  }, [editorMode]);

  // Clear notice timer on unmount
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  // Memoized byte counter (avoids heavy TextEncoder allocation on every keystroke)
  const contentBytes = useMemo(() => new TextEncoder().encode(content).length, [content]);
  const maxBytes = 1048576; // 1MB
  const isTooLarge = contentBytes > maxBytes;
  const canSubmit = content.trim().length > 0 && !isTooLarge && !isSubmitting;

  const handleCopyContent = useCallback(async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      // Fallback if clipboard API restricted
    }
  }, [content]);

  const submitPaste = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Invisible honeypot triggered: silently drop automated submission
    if (honeypot.trim()) {
      setIsSubmitting(false);
      return;
    }

    if (!content.trim()) {
      setErrorMessage('Paste content cannot be empty.');
      return;
    }
    if (isTooLarge) {
      setErrorMessage(`Paste content exceeds the 1MB limit (${(contentBytes / 1024).toFixed(1)} KB).`);
      return;
    }
    if (enablePassword && !password.trim()) {
      setErrorMessage('Password protection is enabled. Please enter an unlock passcode or toggle it off.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: CreatePastePayload = {
      title: title.trim() || undefined,
      content,
      language,
      visibility,
      expiration,
      password: enablePassword && password.trim() ? password.trim() : undefined,
      website: honeypot.trim() || undefined,
    };

    try {
      const result = await pasteApi.createPaste(payload);
      setCreatedPasteId(result.id);
      setDeletionCapability(result.deletionCapability || null);
      try {
        localStorage.setItem(`extraBin_viewed_${result.id}`, Date.now().toString());
      } catch {
        // Ignore quota error
      }
      setShowCreatedModal(true);
      triggerSuccessBurst();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('Failed to create paste. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [content, isTooLarge, contentBytes, enablePassword, password, title, language, visibility, expiration, honeypot]);

  // Keyboard shortcut listener for Ctrl+Enter / Cmd+Enter
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (canSubmit) {
          submitPaste();
        }
      }
    },
    [canSubmit, submitPaste]
  );

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (text) {
      const detected = detectLanguageFromCode(text);
      if (detected) {
        setLanguage(detected);
        const match = LANGUAGES.find((l) => l.value === detected);
        setDetectedNotice(`Auto-detected ${match?.label || detected} syntax!`);
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = setTimeout(() => setDetectedNotice(null), 4000);
      }
    }
  };

  const lines = useMemo(() => content.split('\n'), [content]);

  // Highlight the full content once as a block preserving multi-line tokens
  const highlightedLines = useMemo(() => {
    if (editorMode === 'edit') return [];
    return highlightCodeToLines(content, language);
  }, [content, language, editorMode]);

  const handleModalClose = () => {
    setShowCreatedModal(false);
    setCreatedPasteId(null);
    setDeletionCapability(null);
    setContent('');
    setTitle('');
    setPassword('');
    setEnablePassword(false);
    setShowPassword(false);
    setErrorMessage(null);
    setDetectedNotice(null);
    setExpiration('ONE_DAY');
    setPreviousDuration('ONE_DAY');
    setVisibility('PUBLIC');
    setLanguage('plaintext');
    setEditorMode('edit');
    setHoneypot('');
    setHasCopied(false);
  };

  return (
    <>
      <form onSubmit={submitPaste} onKeyDown={handleKeyDown} className="space-y-6">
        {/* Invisible honeypot field for bot suppression */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}>
          <input
            type="text"
            name="website"
            id="create-paste-website-hp"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 text-red-200 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Title Input */}
        <div>
          <PixelInput
            label="PASTE_TITLE // FILENAME (OPTIONAL)"
            placeholder="e.g. database-migration.sql or config.env"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            variant="dark"
          />
        </div>

        {/* Content Editor Surface */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 px-1">
            <div className="flex items-center gap-3">
              <label
                htmlFor={editorMode !== 'preview' ? 'paste-content' : undefined}
                onClick={() => {
                  if (editorMode === 'preview') setEditorMode('edit');
                }}
                className="font-medium text-slate-300 flex items-center gap-1.5 cursor-pointer select-none"
              >
                <Code className="w-4 h-4 text-brand-400" />
                <span>Paste Content</span>
              </label>

              {detectedNotice && (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300 text-xs border border-brand-500/40 animate-pulse font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                  <span>{detectedNotice}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Mode Switcher */}
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setEditorMode('edit')}
                  className={`px-2.5 py-1 border-2 transition-all uppercase font-bold ${
                    editorMode === 'edit'
                      ? 'bg-[#00cc66] text-black border-black shadow-[2px_2px_0px_#fff]'
                      : 'bg-black text-slate-300 border-white/40 hover:border-white'
                  }`}
                >
                  [EDIT]
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('split')}
                  className={`px-2.5 py-1 border-2 transition-all uppercase font-bold flex items-center gap-1 ${
                    editorMode === 'split'
                      ? 'bg-[#00cc66] text-black border-black shadow-[2px_2px_0px_#fff]'
                      : 'bg-black text-slate-300 border-white/40 hover:border-white'
                  }`}
                  title="Side-by-side editing and live syntax preview"
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>[SPLIT]</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('preview')}
                  className={`px-2.5 py-1 border-2 transition-all uppercase font-bold flex items-center gap-1 ${
                    editorMode === 'preview'
                      ? 'bg-[#00cc66] text-black border-black shadow-[2px_2px_0px_#fff]'
                      : 'bg-black text-slate-300 border-white/40 hover:border-white'
                  }`}
                  title="Full live colored syntax preview"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>[PREVIEW]</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyContent}
                  disabled={!content.trim()}
                  className="px-2.5 py-1 border-2 transition-all uppercase font-bold flex items-center gap-1 bg-black text-slate-300 border-white/40 hover:border-white hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Copy raw content to clipboard"
                >
                  {hasCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#00cc66]" />
                      <span className="text-[#00cc66]">[COPIED]</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>[COPY]</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 font-mono">
                <span className={isTooLarge ? 'text-red-400 font-bold' : ''}>
                  {(contentBytes / 1024).toFixed(1)} KB / 1024 KB
                </span>
                <span>•</span>
                <span>{lines.length} lines</span>
              </div>
            </div>
          </div>

          {/* Editor Surfaces depending on mode */}
          {editorMode === 'edit' && (
            <div className="relative rounded-xl border border-slate-800 bg-slate-900 focus-within:border-brand-500/80 focus-within:ring-2 focus-within:ring-brand-500/30 transition-all">
              <textarea
                ref={textareaRef}
                autoFocus
                id="paste-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Paste or write your text or source code here... (Ctrl+Enter to publish)"
                rows={16}
                className="w-full p-4 bg-transparent font-mono text-sm text-slate-100 placeholder-slate-600 focus:outline-none resize-y min-h-[320px]"
              />
            </div>
          )}

          {editorMode === 'split' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-[340px]">
              {/* Left: Input Textarea */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 focus-within:border-brand-500/80 focus-within:ring-2 focus-within:ring-brand-500/30 transition-all flex flex-col">
                <div className="px-3.5 py-2 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Raw Editor
                </div>
                <textarea
                  id="paste-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder="Paste or write your text or source code here... (Ctrl+Enter to publish)"
                  className="w-full flex-1 p-3.5 bg-transparent font-mono text-sm text-slate-100 placeholder-slate-600 focus:outline-none resize-none min-h-[300px]"
                />
              </div>

              {/* Right: Live Syntax Colored Surface */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                <div className="px-3.5 py-2 border-b border-slate-800 text-xs font-semibold text-brand-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Live {LANGUAGES.find((l) => l.value === language)?.label || language} Highlight</span>
                  <span className="text-slate-500 font-mono text-[11px]">{lines.length} lines</span>
                </div>
                <div className="flex-1 overflow-auto max-h-[420px] flex font-mono text-xs sm:text-sm">
                  {/* Line numbers gutter strictly matched to line height */}
                  <div className="py-3 px-3 bg-slate-950/90 border-r border-slate-800 text-slate-600 text-right select-none shrink-0 min-w-[2.5rem] font-mono text-xs sm:text-sm leading-6">
                    {lines.map((_, i) => (
                      <div key={i + 1} className="leading-6 h-6">
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  {/* Colored Code text */}
                  <pre className="flex-1 p-3 text-slate-100 overflow-x-auto whitespace-pre font-mono m-0 bg-transparent text-xs sm:text-sm leading-6">
                    <code className={`language-${language} block leading-6`}>
                      {highlightedLines.map((lineHtml, i) => (
                        <div
                          key={i}
                          className="leading-6 h-6 overflow-hidden"
                          dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
                        />
                      ))}
                    </code>
                  </pre>
                </div>
              </div>
            </div>
          )}

          {editorMode === 'preview' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 flex flex-col overflow-hidden shadow-2xl">
              <div className="px-4 py-2.5 border-b border-slate-800 text-xs font-semibold text-brand-400 uppercase tracking-wider flex items-center justify-between bg-slate-900/80">
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-400" />
                  <span>Syntax Preview: {LANGUAGES.find((l) => l.value === language)?.label || language}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditorMode('edit')}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Return to editor
                </button>
              </div>

              <div className="overflow-auto max-h-[480px] flex font-mono text-xs sm:text-sm">
                {/* Line numbers gutter */}
                <div className="py-4 px-3 sm:px-4 bg-slate-950/90 border-r border-slate-800 text-slate-600 text-right select-none shrink-0 min-w-[3rem] font-mono text-xs sm:text-sm leading-6">
                  {lines.map((_, i) => (
                    <div key={i + 1} className="leading-6 h-6">
                      {i + 1}
                    </div>
                  ))}
                </div>
                {/* Colored Code text */}
                <pre className="flex-1 py-4 px-4 text-slate-100 overflow-x-auto whitespace-pre font-mono m-0 bg-transparent text-xs sm:text-sm leading-6">
                  <code className={`language-${language} block leading-6`}>
                    {highlightedLines.map((lineHtml, i) => (
                      <div
                        key={i}
                        className="leading-6 h-6 overflow-hidden"
                        dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
                      />
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Configuration Row: Language, Visibility, Expiration */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Language Selection */}
          <div className="space-y-1.5">
            <label htmlFor="language-select" className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 [text-shadow:1px_1px_#000]">
              <Code className="w-3.5 h-3.5 text-[#00cc66]" />
              <span>&gt; SYNTAX_LANGUAGE</span>
            </label>
            <NativeSelect
              id="language-select"
              value={language}
              onChange={(val) => setLanguage(String(val))}
              className="w-full px-3.5 py-2.5 bg-black border-2 border-white text-white font-mono text-xs uppercase shadow-[3px_3px_0_0_#000] focus:border-[#00cc66] outline-none cursor-pointer"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value} className="bg-black text-white">
                  {lang.label.toUpperCase()}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Visibility Selection */}
          <div className="space-y-1.5">
            <label htmlFor="visibility-select" className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 [text-shadow:1px_1px_#000]">
              <Eye className="w-3.5 h-3.5 text-[#00cc66]" />
              <span>&gt; VISIBILITY_POLICY</span>
            </label>
            <NativeSelect
              id="visibility-select"
              value={visibility}
              onChange={(val) => setVisibility(val as Visibility)}
              className="w-full px-3.5 py-2.5 bg-black border-2 border-white text-white font-mono text-xs uppercase shadow-[3px_3px_0_0_#000] focus:border-[#00cc66] outline-none cursor-pointer"
            >
              <option value="PUBLIC" className="bg-black text-white">PUBLIC (INDEXED IN DISCOVERY)</option>
              <option value="UNLISTED" className="bg-black text-white">UNLISTED (OPAQUE LINK ONLY)</option>
              <option value="PRIVATE" disabled={!isAuthenticated} className="bg-black text-white">
                PRIVATE {isAuthenticated ? '(RESTRICTED TO YOUR ACCOUNT)' : '(SIGN IN REQUIRED)'}
              </option>
            </NativeSelect>
          </div>

          {/* Expiration Selection */}
          <div className="space-y-1.5">
            <label htmlFor="expiration-select" className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 [text-shadow:1px_1px_#000]">
              <Timer className="w-3.5 h-3.5 text-[#00cc66]" />
              <span>&gt; EXPIRATION_TTL</span>
            </label>
            <NativeSelect
              id="expiration-select"
              value={expiration === 'VIEW_ONCE' ? previousDuration : expiration}
              disabled={expiration === 'VIEW_ONCE'}
              onChange={(val) => {
                const newExp = val as ExpirationPolicy;
                setExpiration(newExp);
                if (newExp !== 'VIEW_ONCE') {
                  setPreviousDuration(newExp);
                }
              }}
              className="w-full px-3.5 py-2.5 bg-black border-2 border-white text-white font-mono text-xs uppercase shadow-[3px_3px_0_0_#000] focus:border-[#00cc66] outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {EXPIRATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-black text-white">
                  {opt.label.toUpperCase()}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {/* Security & Lifecycle Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {/* View Once Toggle */}
          <ToggleSwitch
            id="view-once-toggle"
            checked={expiration === 'VIEW_ONCE'}
            onChange={(checked) => {
              if (checked) {
                if (expiration !== 'VIEW_ONCE') {
                  setPreviousDuration(expiration);
                }
                setExpiration('VIEW_ONCE');
              } else {
                setExpiration(previousDuration === 'VIEW_ONCE' ? 'ONE_DAY' : previousDuration);
              }
            }}
            icon={<Flame className="w-4 h-4 text-orange-400" />}
            label="View Once Mode"
            description="Permanently burn and destroy this paste after its first view."
            activeColorClass="bg-orange-500"
            activeGlowClass="shadow-[0_0_12px_rgba(249,115,22,0.4)]"
          />

          {/* Password Protection Toggle */}
          <ToggleSwitch
            id="password-protect-toggle"
            checked={enablePassword}
            onChange={(checked) => {
              setEnablePassword(checked);
              if (!checked) {
                setPassword('');
                setErrorMessage(null);
              }
            }}
            icon={<KeyRound className="w-4 h-4 text-emerald-400" />}
            label="Password Protection"
            description="Require a secret passcode to decrypt and unlock this paste."
          />
        </div>

        {/* Animated Password Input Field */}
        <AnimatePresence>
          {enablePassword && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="p-4 rounded-xl border border-brand-500/30 bg-brand-500/5 space-y-2 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <label htmlFor="paste-password" className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-brand-400" />
                  <span>Enter Secret Passcode</span>
                </label>
                <span className="text-[11px] text-slate-400">Secure server-side hash verification</span>
              </div>
              <div className="relative">
                <input
                  id="paste-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Set an unlock passcode for this paste..."
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 placeholder-slate-600 pr-10"
                  maxLength={100}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs p-1"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Visibility Explanation Banner */}
        <div className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40 text-xs text-slate-400 flex items-center gap-2.5 backdrop-blur-sm">
          {visibility === 'PUBLIC' && (
            <>
              <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Public pastes appear in community discovery and live feeds.</span>
            </>
          )}
          {visibility === 'UNLISTED' && (
            <>
              <Share2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Unlisted pastes are hidden from discovery and only openable via their secure link.</span>
            </>
          )}
          {visibility === 'PRIVATE' && (
            <>
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Private pastes are restricted strictly to your authenticated account.</span>
            </>
          )}
        </div>

        {/* Submission Action */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-400 hidden sm:block font-mono [text-shadow:1px_1px_#000]">
            <span>SHORTCUT: [Ctrl + Enter] TO DISPATCH</span>
          </div>

          <PixelButton
            type="submit"
            variant="green"
            className="!py-3 !px-6 text-sm"
            isLoading={isSubmitting}
            disabled={!canSubmit}
            leftIcon={<Share2 className="w-4 h-4" />}
          >
            &gt; PUBLISH_RECORD_TO_NETWORK
          </PixelButton>
        </div>
      </form>

      {/* Shareable Link & Deletion Modal */}
      {createdPasteId && (
        <PasteCreatedModal
          pasteId={createdPasteId}
          deletionCapability={deletionCapability}
          isViewOnce={expiration === 'VIEW_ONCE' || expiration === 'BURN_AFTER_READING'}
          isPasswordProtected={enablePassword && !!password.trim()}
          isOpen={showCreatedModal}
          onClose={handleModalClose}
        />
      )}
    </>
  );
};
