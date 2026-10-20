import React, { useEffect, useRef, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { Icon } from '../../../components/ui/PaperIcon';
import { buildCanonicalShareUrl, resolvePublicBaseUrl } from '../lib/shareUrl';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  pasteId: string;
  pasteTitle?: string;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  isOpen,
  onClose,
  pasteId,
  pasteTitle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const canonicalUrl = useMemo(() => {
    const base = resolvePublicBaseUrl();
    if (!base) {
      return `/p/${pasteId}`;
    }
    return buildCanonicalShareUrl({ baseUrl: base, pasteId });
  }, [pasteId]);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    setQrError(null);

    QRCode.toCanvas(
      canvasRef.current,
      canonicalUrl,
      {
        width: 240,
        margin: 2,
        color: {
          dark: '#17201d',
          light: '#faf8f2',
        },
        errorCorrectionLevel: 'M',
      },
      (error) => {
        if (error) {
          setQrError('Failed to generate QR code canvas.');
        }
      }
    );
  }, [isOpen, canonicalUrl]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const filename = `${(pasteTitle || pasteId).replace(/[^a-zA-Z0-9_-]/g, '_')}-qrcode.png`;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      setQrError('Failed to download QR code image.');
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div className="w-full max-w-sm rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-6 shadow-[8px_10px_0px_#17201d] space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#d5d0c5] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#ebe7dc] border border-[#d5d0c5]">
              <Icon name="qr" size={18} className="text-[#ff5c3d]" />
            </div>
            <div>
              <h2 id="qr-modal-title" className="text-base font-bold text-[#17201d] m-0">
                Share via QR Code
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
            aria-label="Close QR modal"
          >
            &times;
          </button>
        </div>

        {/* QR Code Canvas Card */}
        <div className="p-4 bg-white border-2 border-[#17201d] rounded-xl flex flex-col items-center justify-center shadow-[2px_2px_0px_#17201d]">
          {qrError ? (
            <div className="text-xs font-mono text-[#dc2626] p-4 text-center">
              {qrError}
            </div>
          ) : (
            <canvas ref={canvasRef} className="block rounded" />
          )}
          <span className="text-[10px] font-mono text-[#74786f] mt-2">
            Scan with any mobile camera to view paste
          </span>
        </div>

        {/* Canonical URL and Copy */}
        <div className="space-y-1.5 font-mono">
          <label className="block text-[11px] font-bold text-[#17201d]">
            Canonical Paste URL:
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              readOnly
              value={canonicalUrl}
              className="controls-input text-[11px] font-mono flex-1 py-1.5 px-2 bg-white border border-[#d5d0c5]"
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#ebe7dc] text-[#17201d] text-xs font-bold rounded border border-[#17201d] hover:bg-[#d5d0c5] transition-all whitespace-nowrap"
            >
              {isCopied ? <Icon name="check" size={12} className="text-[#15803d]" /> : <Icon name="copy" size={12} />}
              <span>{isCopied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-[#d5d0c5]">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-[#d5d0c5] bg-white text-xs font-mono font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-all"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-[#17201d] bg-[#ff5c3d] text-[#17201d] text-xs font-mono font-bold shadow-[2px_2px_0px_#17201d] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all"
          >
            <Icon name="upload" size={13} className="rotate-180" />
            <span>Download PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default QrCodeModal;
