import React, { useState, useRef, useEffect } from 'react';
import { QrCode, Download, Copy, RefreshCw, CheckCircle2 } from 'lucide-react';

export const QrCodeDemo: React.FC = () => {
  const [pasteId] = useState('a1b2c3d4');
  const [url] = useState(`https://extrabin.example.com/p/${pasteId}`);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawQr = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 200;
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = '#faf8f2';
    ctx.fillRect(0, 0, size, size);

    const moduleCount = 21;
    const moduleSize = Math.floor(size / (moduleCount + 2));
    const offset = Math.floor((size - moduleCount * moduleSize) / 2);

    ctx.fillStyle = '#17201d';

    const pattern = [
      [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,1,0,0,1,0,1,1,0,1,0,0,0,0,0,1],
      [1,0,1,1,1,0,1,0,1,1,0,0,1,0,1,0,1,1,1,0,1],
      [1,0,1,1,1,0,1,0,0,1,1,0,0,0,1,0,1,1,1,0,1],
      [1,0,1,1,1,0,1,0,1,0,1,1,0,0,1,0,1,1,1,0,1],
      [1,0,0,0,0,0,1,0,0,0,0,1,1,0,1,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1],
      [0,0,0,0,0,0,0,0,1,1,0,0,1,0,0,0,0,0,0,0,0],
      [1,0,1,0,1,1,1,1,0,0,1,1,0,1,1,0,1,0,1,1,0],
      [0,1,0,1,1,0,0,1,1,0,0,1,0,1,0,1,0,1,0,0,1],
      [1,1,0,0,1,0,1,0,1,1,1,0,1,0,1,1,0,0,1,1,0],
      [0,1,1,0,0,1,0,0,0,1,0,1,1,0,0,1,0,1,0,1,0],
      [1,0,1,1,1,0,1,1,0,0,1,0,0,1,1,0,1,0,1,0,1],
      [0,0,0,0,0,0,0,0,1,0,1,1,0,1,0,0,1,1,0,0,0],
      [1,1,1,1,1,1,1,0,0,1,0,0,1,0,1,0,1,0,1,1,0],
      [1,0,0,0,0,0,1,0,1,0,1,1,0,1,0,1,0,0,1,0,1],
      [1,0,1,1,1,0,1,0,1,1,0,0,1,1,1,0,0,1,0,1,0],
      [1,0,1,1,1,0,1,0,0,0,1,0,1,0,0,1,1,0,1,0,1],
      [1,0,1,1,1,0,1,0,1,0,0,1,0,1,1,0,1,1,0,1,0],
      [1,0,0,0,0,0,1,0,0,1,1,0,1,0,0,1,0,0,1,0,1],
      [1,1,1,1,1,1,1,0,1,0,1,1,0,0,1,0,1,0,0,1,0],
    ];

    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (pattern[row]?.[col]) {
          ctx.fillRect(
            offset + col * moduleSize,
            offset + row * moduleSize,
            moduleSize,
            moduleSize
          );
        }
      }
    }
  };

  useEffect(() => {
    drawQr();
  }, []);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopied(false);
    });
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'paste-qrcode.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleReset = () => {
    setCopied(false);
    drawQr();
  };

  return (
    <div
      data-testid="qr-code-demo"
      className="rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-5 sm:p-6 shadow-[4px_4px_0px_#17201d] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d4ca]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#fdf4ff] border border-[#c026d3] text-[#86198f]">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-mono text-[#17201d] m-0">QR Code Generator</h3>
            <p className="text-xs font-mono text-[#74786f] m-0">Generate scannable QR codes for paste URLs</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="px-2.5 py-1 rounded-lg border border-[#d5d0c5] bg-white text-xs font-mono text-[#525a54] hover:text-[#17201d] flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Demo</span>
        </button>
      </div>

      <div className="p-2.5 rounded-lg bg-[#ebe7dc]/70 border border-[#d5d0c5] text-[11px] font-mono text-[#525a54] flex items-center justify-between">
        <span>Simulation only — runs entirely in your browser and does not call or persist data to the server.</span>
        <span className="text-[10px] bg-[#fdf4ff] text-[#86198f] px-1.5 py-0.5 rounded border border-[#c026d3] font-bold shrink-0">
          SIMULATION
        </span>
      </div>

      <div className="p-4 rounded-xl border border-[#d5d0c5] bg-white space-y-4 font-mono text-xs">
        <div className="flex flex-col items-center gap-3">
          <div className="p-4 rounded-xl bg-white border-2 border-[#d5d0c5] shadow-sm">
            <canvas
              ref={canvasRef}
              className="block"
              aria-label="QR code for paste URL"
            />
          </div>
          <p className="text-[11px] text-[#74786f] text-center m-0">
            Scan with any mobile camera to view paste
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-[#74786f] block">Paste URL</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={url}
              className="flex-1 px-3 py-2 rounded-lg border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono text-[#17201d] focus:outline-none"
              aria-label="Paste URL"
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              className="px-3 py-2 rounded-lg bg-[#c026d3] text-white font-bold text-xs hover:bg-[#a21caf] transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          className="w-full px-4 py-2.5 rounded-lg bg-[#17201d] text-white font-bold text-xs hover:bg-[#2f3833] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[2px_2px_0px_#74786f]"
        >
          <Download className="w-4 h-4" />
          <span>Download PNG</span>
        </button>
      </div>
    </div>
  );
};
