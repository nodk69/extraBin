import React, { useState, useMemo } from 'react';
import { History, GitCompare, RefreshCw, ChevronRight } from 'lucide-react';

interface SimVersion {
  version: number;
  label: string;
  content: string;
}

const versions: SimVersion[] = [
  {
    version: 1,
    label: 'v1 — Initial',
    content: 'server {\n  listen 80;\n  server_name example.com;\n}',
  },
  {
    version: 2,
    label: 'v2 — Added SSL',
    content: 'server {\n  listen 80;\n  listen 443 ssl;\n  server_name example.com;\n  ssl_certificate /etc/ssl/cert.pem;\n}',
  },
  {
    version: 3,
    label: 'v3 — Added proxy',
    content: 'server {\n  listen 80;\n  listen 443 ssl;\n  server_name example.com;\n  ssl_certificate /etc/ssl/cert.pem;\n\n  location /api {\n    proxy_pass http://localhost:3000;\n  }\n}',
  },
];

function computeDiff(base: string, target: string) {
  const baseLines = base.split('\n');
  const targetLines = target.split('\n');
  const result: { type: 'equal' | 'add' | 'remove'; content: string }[] = [];

  const maxLen = Math.max(baseLines.length, targetLines.length);
  let bi = 0;
  let ti = 0;

  while (bi < baseLines.length || ti < targetLines.length) {
    if (bi < baseLines.length && ti < targetLines.length) {
      if (baseLines[bi] === targetLines[ti]) {
        result.push({ type: 'equal', content: baseLines[bi] });
        bi++;
        ti++;
      } else {
        result.push({ type: 'remove', content: baseLines[bi] });
        bi++;
        if (ti < targetLines.length) {
          result.push({ type: 'add', content: targetLines[ti] });
          ti++;
        }
      }
    } else if (bi < baseLines.length) {
      result.push({ type: 'remove', content: baseLines[bi] });
      bi++;
    } else {
      result.push({ type: 'add', content: targetLines[ti] });
      ti++;
    }
    if (result.length > maxLen * 3) break;
  }

  return result;
}

export const RevisionHistoryDemo: React.FC = () => {
  const [baseIdx, setBaseIdx] = useState(0);
  const [targetIdx, setTargetIdx] = useState(1);

  const diff = useMemo(() => {
    if (baseIdx === targetIdx) return [];
    return computeDiff(versions[baseIdx].content, versions[targetIdx].content);
  }, [baseIdx, targetIdx]);

  const additions = diff.filter((d) => d.type === 'add').length;
  const deletions = diff.filter((d) => d.type === 'remove').length;

  const handleReset = () => {
    setBaseIdx(0);
    setTargetIdx(1);
  };

  return (
    <div
      data-testid="revision-history-demo"
      className="rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-5 sm:p-6 shadow-[4px_4px_0px_#17201d] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d4ca]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#ffedd5] border border-[#f97316] text-[#c2410c]">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-mono text-[#17201d] m-0">Revision Diff Simulator</h3>
            <p className="text-xs font-mono text-[#74786f] m-0">Compare paste versions with line-by-line diffs</p>
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
        <span className="text-[10px] bg-[#ffedd5] text-[#c2410c] px-1.5 py-0.5 rounded border border-[#f97316] font-bold shrink-0">
          SIMULATION
        </span>
      </div>

      <div className="p-4 rounded-xl border border-[#d5d0c5] bg-white space-y-4 font-mono text-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-[#74786f]">Base:</label>
            <select
              value={baseIdx}
              onChange={(e) => setBaseIdx(Number(e.target.value))}
              className="px-2 py-1 rounded-md border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono text-[#17201d] focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              aria-label="Base version"
            >
              {versions.map((v, i) => (
                <option key={v.version} value={i}>{v.label}</option>
              ))}
            </select>
          </div>
          <ChevronRight className="w-4 h-4 text-[#74786f] hidden sm:block" />
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-[#74786f]">Target:</label>
            <select
              value={targetIdx}
              onChange={(e) => setTargetIdx(Number(e.target.value))}
              className="px-2 py-1 rounded-md border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono text-[#17201d] focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              aria-label="Target version"
            >
              {versions.map((v, i) => (
                <option key={v.version} value={i}>{v.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {additions > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0] text-[10px] font-bold">
                +{additions}
              </span>
            )}
            {deletions > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#fef2f2] text-[#991b1b] border border-[#fecaca] text-[10px] font-bold">
                -{deletions}
              </span>
            )}
          </div>
        </div>

        {baseIdx === targetIdx ? (
          <div className="p-4 rounded-lg bg-[#ebe7dc]/50 border border-[#d5d0c5] text-center text-[#74786f] text-[11px]">
            Select different versions to compare.
          </div>
        ) : (
          <div className="rounded-lg border border-[#d5d0c5] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#17201d] text-[#e8e4da] text-[10px] font-bold">
              <GitCompare className="w-3.5 h-3.5" />
              <span>Unified Diff</span>
            </div>
            <div className="p-0 max-h-64 overflow-y-auto">
              {diff.map((line, i) => (
                <div
                  key={i}
                  className={`px-3 py-0.5 text-[11px] leading-5 border-l-4 ${
                    line.type === 'add'
                      ? 'bg-[#f0fdf4] border-[#16a34a] text-[#166534]'
                      : line.type === 'remove'
                        ? 'bg-[#fef2f2] border-[#ef4444] text-[#991b1b]'
                        : 'bg-white border-transparent text-[#525a54]'
                  }`}
                >
                  <span className="inline-block w-4 text-[10px] font-bold select-none">
                    {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                  </span>
                  {line.content || ' '}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
