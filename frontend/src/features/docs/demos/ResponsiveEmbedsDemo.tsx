import React, { useState } from 'react';
import { FileCode, Copy, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';

const heightPresets = [
  { label: 'Compact', value: 300 },
  { label: 'Standard', value: 450 },
  { label: 'Extended', value: 600 },
];

const sampleCode = `function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));`;

export const ResponsiveEmbedsDemo: React.FC = () => {
  const [selectedHeight, setSelectedHeight] = useState(450);
  const [copied, setCopied] = useState(false);

  const embedHtml = `<iframe
  src="https://extrabin.example.com/embed/a1b2c3d4"
  width="100%"
  height="${selectedHeight}"
  frameborder="0"
  loading="lazy"
  sandbox="allow-scripts allow-same-origin allow-popups"
></iframe>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedHtml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopied(false);
    });
  };

  const handleReset = () => {
    setSelectedHeight(450);
    setCopied(false);
  };

  return (
    <div
      data-testid="responsive-embeds-demo"
      className="rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-5 sm:p-6 shadow-[4px_4px_0px_#17201d] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d4ca]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#f1f5f9] border border-[#64748b] text-[#334155]">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-mono text-[#17201d] m-0">Embed Code Generator</h3>
            <p className="text-xs font-mono text-[#74786f] m-0">Generate sandboxed iframe snippets for external pages</p>
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
        <span className="text-[10px] bg-[#f1f5f9] text-[#334155] px-1.5 py-0.5 rounded border border-[#64748b] font-bold shrink-0">
          SIMULATION
        </span>
      </div>

      <div className="p-4 rounded-xl border border-[#d5d0c5] bg-white space-y-4 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-[#74786f]">Height:</span>
          {heightPresets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setSelectedHeight(preset.value)}
              className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                selectedHeight === preset.value
                  ? 'bg-[#17201d] text-white border-[#17201d]'
                  : 'bg-[#faf8f2] text-[#525a54] border-[#d5d0c5] hover:border-[#64748b]'
              }`}
            >
              {preset.label} ({preset.value}px)
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-[#d5d0c5] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#17201d] text-[#e8e4da] text-[10px] font-bold">
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Preview — /embed/a1b2c3d4</span>
          </div>
          <div
            className="bg-[#faf8f2] p-3 overflow-hidden"
            style={{ height: Math.min(selectedHeight * 0.4, 200) }}
          >
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[#d8d4ca]">
              <span className="text-[10px] font-bold text-[#17201d]">greet.js</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]">JavaScript</span>
            </div>
            <pre className="text-[10px] text-[#2f3833] leading-4 overflow-hidden m-0">
              <code>{sampleCode}</code>
            </pre>
            <div className="mt-2 pt-2 border-t border-[#d8d4ca] text-[9px] text-[#74786f] flex items-center justify-between">
              <span>4 lines · 0.1 KB</span>
              <span>Powered by ExtraBin</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#74786f]">Embed HTML</span>
            <button
              type="button"
              onClick={handleCopy}
              className="px-2.5 py-1 rounded-lg bg-[#64748b] text-white text-[11px] font-bold hover:bg-[#475569] transition-all cursor-pointer flex items-center gap-1.5"
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
          <pre className="p-3 rounded-lg bg-[#17201d] text-[#e8e4da] text-[10px] leading-4 overflow-x-auto m-0">
            <code>{embedHtml}</code>
          </pre>
        </div>

        <div className="p-2.5 rounded-lg bg-[#fef9c3] border border-[#ca8a04] text-[11px] text-[#854d0e]">
          <strong>Security:</strong> Embeds are read-only and sandboxed. Only public, non-password-protected pastes can be embedded.
        </div>
      </div>
    </div>
  );
};
