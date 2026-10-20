import React, { useState, useMemo } from 'react';
import { Icon } from '../../../components/ui/PaperIcon';

interface EmbedModalProps {
  isOpen: boolean;
  onClose: () => void;
  pasteId: string;
  pasteTitle?: string;
}

export const EmbedModal: React.FC<EmbedModalProps> = ({
  isOpen,
  onClose,
  pasteId,
  pasteTitle,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [embedHeight, setEmbedHeight] = useState('450');

  const origin = useMemo(() => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return '';
  }, []);

  const embedUrl = `${origin}/embed/${pasteId}`;

  const snippet = useMemo(() => {
    return `<iframe src="${embedUrl}" width="100%" height="${embedHeight}" frameborder="0" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`;
  }, [embedUrl, embedHeight]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback: select text from textarea
      const el = document.getElementById('embed-snippet-textarea') as HTMLTextAreaElement | null;
      if (el) {
        el.select();
        document.execCommand('copy');
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="embed-modal-title"
    >
      <div className="w-full max-w-2xl rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-6 shadow-[8px_10px_0px_#17201d] space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#d5d0c5] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#ebe7dc] border border-[#d5d0c5]">
              <Icon name="code" size={18} className="text-[#ff5c3d]" />
            </div>
            <div>
              <h2 id="embed-modal-title" className="text-base font-bold text-[#17201d] m-0">
                Embed Snippet
              </h2>
              <p className="text-[11px] font-mono text-[#74786f] m-0">
                {pasteTitle ? `"${pasteTitle}"` : `#${pasteId.slice(0, 8)}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[#74786f] hover:text-[#17201d] hover:bg-[#ebe7dc] transition-all"
            aria-label="Close embed modal"
          >
            &times;
          </button>
        </div>

        {/* Security / Privacy Disclosure */}
        <div className="p-3 bg-[#e0f2fe] border border-[#bae6fd] rounded-lg text-xs font-mono text-[#0369a1] space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <Icon name="globe" size={13} />
            <span>Public Read-Only Embed</span>
          </div>
          <p className="m-0 leading-relaxed text-[11px]">
            Anyone with access to the host page can read this snippet. Embeds are read-only, non-executable, and strictly supported for public pastes.
          </p>
        </div>

        {/* Height configuration */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <label htmlFor="embed-height-select" className="font-bold text-[#17201d]">
            Frame Height:
          </label>
          <select
            id="embed-height-select"
            value={embedHeight}
            onChange={(e) => setEmbedHeight(e.target.value)}
            className="controls-input text-xs font-mono py-1 px-2"
          >
            <option value="300">300 px (Compact)</option>
            <option value="450">450 px (Standard)</option>
            <option value="600">600 px (Extended)</option>
          </select>
        </div>

        {/* Copyable HTML Snippet */}
        <div className="space-y-1.5">
          <label htmlFor="embed-snippet-textarea" className="block text-xs font-mono font-bold text-[#17201d]">
            HTML Embed Code:
          </label>
          <div className="relative">
            <textarea
              id="embed-snippet-textarea"
              readOnly
              rows={3}
              value={snippet}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              className="controls-input text-xs font-mono w-full p-2.5 bg-white border border-[#17201d] resize-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5 px-3 py-1 bg-[#ff5c3d] text-[#17201d] text-xs font-mono font-bold rounded border border-[#17201d] shadow-[1px_1px_0px_#17201d] hover:brightness-105 transition-all"
            >
              {isCopied ? <Icon name="check" size={12} className="text-[#15803d]" /> : <Icon name="copy" size={12} />}
              <span>{isCopied ? 'Copied!' : 'Copy Code'}</span>
            </button>
          </div>
        </div>

        {/* Live Preview */}
        <div className="space-y-1.5 pt-1">
          <span className="block text-xs font-mono font-bold text-[#17201d]">
            Live Preview:
          </span>
          <div className="rounded-xl border-2 border-[#17201d] overflow-hidden bg-white shadow-[2px_2px_0px_#17201d]">
            <iframe
              src={embedUrl}
              title="Embed Preview"
              width="100%"
              height={embedHeight}
              className="border-0 block"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end pt-2 border-t border-[#d5d0c5]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-[#d5d0c5] bg-white text-xs font-mono font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
export default EmbedModal;
