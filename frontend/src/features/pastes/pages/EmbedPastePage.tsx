import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { pasteApi } from '../api/pasteApi';
import { EmbedPasteView, PasteFileItem } from '../types/paste';
import { renderSafeSyntaxHighlight } from '../../../lib/syntax/highlighter';
import { Icon } from '../../../components/ui/PaperIcon';
import { Loading } from '../../../components/ui/Loading';

export const EmbedPastePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [paste, setPaste] = useState<EmbedPasteView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    pasteApi
      .getEmbedPaste(id)
      .then((data) => {
        setPaste(data);
        setLoading(false);
      })
      .catch((err: any) => {
        const detail =
          err?.response?.data?.detail ||
          'This paste is either private, expired, password-protected, or does not exist.';
        setError(detail);
        setLoading(false);
      });
  }, [id]);

  const files: PasteFileItem[] = useMemo(() => {
    if (!paste || !paste.files || paste.files.length === 0) return [];
    return paste.files;
  }, [paste]);

  const safeIndex = activeFileIndex < files.length ? activeFileIndex : 0;
  const activeFile = files[safeIndex] || null;

  const lines = useMemo(() => {
    if (!activeFile || !activeFile.content) return [];
    return activeFile.content.split('\n');
  }, [activeFile]);

  const handleCopy = async () => {
    if (!activeFile?.content) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8f2] flex items-center justify-center">
        <Loading message="Loading embed snippet..." />
      </div>
    );
  }

  if (error || !paste || !activeFile) {
    return (
      <div className="min-h-screen bg-[#faf8f2] flex flex-col items-center justify-center p-6 text-center font-mono">
        <div className="max-w-md p-6 bg-white border-2 border-[#17201d] rounded-2xl shadow-[4px_4px_0px_#17201d] space-y-3">
          <div className="w-10 h-10 mx-auto rounded-xl bg-[#fee2e2] text-[#dc2626] border border-[#fca5a5] flex items-center justify-center">
            <Icon name="lock" size={20} />
          </div>
          <h2 className="text-base font-bold text-[#17201d] m-0">Snippet Unavailable</h2>
          <p className="text-xs text-[#74786f] leading-relaxed m-0">
            {error || 'This paste is not available for external embedding.'}
          </p>
          <div className="pt-2">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ff5c3d] text-[#17201d] text-xs font-bold border border-[#17201d] shadow-[2px_2px_0px_#17201d] no-underline"
            >
              <span>Visit ExtraBin</span>
              <Icon name="external-link" size={12} />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf8f2] text-[#17201d] flex flex-col font-sans select-text">
      {/* Top Header Bar */}
      <header className="px-3 py-2 bg-[#faf8f2] border-b-2 border-[#17201d] flex items-center justify-between flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href={`/p/${paste.publicId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#17201d] hover:text-[#ff5c3d] no-underline shrink-0"
            title="Open on ExtraBin"
          >
            <span className="px-1.5 py-0.5 rounded bg-[#17201d] text-[#c6f05b] text-[10px] tracking-wider uppercase">
              EXTRABIN
            </span>
          </a>
          <span className="text-[#d5d0c5] shrink-0">/</span>
          <h1 className="text-xs font-bold text-[#17201d] truncate m-0 font-mono" title={paste.title || 'Untitled'}>
            {paste.title || 'Untitled Paste'}
          </h1>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[#ebe7dc] text-[#555] border border-[#d5d0c5] shrink-0 uppercase">
            {activeFile.language || paste.language}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#17201d] bg-white text-[11px] font-semibold hover:bg-[#ebe7dc] transition-all cursor-pointer shadow-[1px_1px_0px_#17201d]"
            title="Copy snippet code"
            aria-label="Copy snippet code"
          >
            {isCopied ? <Icon name="check" size={11} className="text-[#15803d]" /> : <Icon name="copy" size={11} />}
            <span>{isCopied ? 'Copied' : 'Copy'}</span>
          </button>
          <a
            href={`/p/${paste.publicId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#17201d] bg-[#ff5c3d] text-[#17201d] text-[11px] font-bold no-underline hover:brightness-105 transition-all shadow-[1px_1px_0px_#17201d]"
            title="Open in ExtraBin"
          >
            <span>Open</span>
            <Icon name="external-link" size={11} />
          </a>
        </div>
      </header>

      {/* Multi-file Tab Bar (if multi-file paste) */}
      {files.length > 1 && (
        <div className="px-3 py-1.5 bg-[#ebe7dc] border-b border-[#d5d0c5] flex items-center gap-1.5 overflow-x-auto shrink-0 font-mono text-xs">
          {files.map((file, idx) => (
            <button
              key={file.filename + idx}
              type="button"
              onClick={() => setActiveFileIndex(idx)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold whitespace-nowrap transition-all border ${
                safeIndex === idx
                  ? 'bg-white text-[#17201d] border-[#17201d] shadow-[1px_1px_0px_#17201d]'
                  : 'bg-transparent text-[#74786f] border-transparent hover:text-[#17201d]'
              }`}
            >
              {file.filename}
            </button>
          ))}
        </div>
      )}

      {/* Code Viewer Body */}
      <main className="flex-1 overflow-auto bg-[#faf8f2]">
        <div className="font-mono text-xs leading-[1.6] flex min-w-full w-max">
          {/* Line Numbers Gutter */}
          <div className="py-3 pl-3 pr-3 select-none text-right text-[#a0a59b] bg-[#f4f1e6] border-r border-[#e5e0d3] shrink-0 font-mono">
            {lines.map((_, i) => (
              <div key={i} className="h-[20px]">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code Content */}
          <div className="py-3 px-4 flex-1 overflow-visible">
            {lines.map((line, i) => (
              <div key={i} className="h-[20px] whitespace-pre font-mono">
                {line ? renderSafeSyntaxHighlight(line, activeFile.language || paste.language) : '\u00A0'}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Bottom Footer Info Strip */}
      <footer className="px-3 py-1 bg-[#ebe7dc] border-t border-[#d5d0c5] flex items-center justify-between text-[10px] font-mono text-[#74786f] shrink-0">
        <div className="flex items-center gap-2">
          <span>{lines.length} lines</span>
          <span>•</span>
          <span>{((activeFile.sizeBytes || activeFile.content.length) / 1024).toFixed(1)} KB</span>
        </div>
        <div>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#17201d] no-underline transition-colors"
          >
            Powered by ExtraBin
          </a>
        </div>
      </footer>
    </div>
  );
};

export default EmbedPastePage;
