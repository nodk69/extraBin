import React, { useState } from 'react';
import { Terminal, Copy, Check } from 'lucide-react';

const suffixConfigs: Record<
  string,
  { mime: string; exampleBody: string; desc: string }
> = {
  '.json': {
    mime: 'application/json',
    exampleBody: '{\n  "service": "billing-worker",\n  "version": "2.4.0",\n  "active": true\n}',
    desc: 'Structured machine payloads & configurations',
  },
  '.yaml': {
    mime: 'application/yaml',
    exampleBody: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: auth-service',
    desc: 'Kubernetes manifests & CI workflow pipelines',
  },
  '.md': {
    mime: 'text/markdown',
    exampleBody: '# Deployment Guide\n\nRun `docker compose up -d` to initialize dependencies.',
    desc: 'Formatted documentation syndication',
  },
  '.txt': {
    mime: 'text/plain',
    exampleBody: '#!/usr/bin/env bash\necho "Starting ExtraBin worker..."\nexit 0',
    desc: 'Raw shell scripts & system logs',
  },
  '.csv': {
    mime: 'text/csv',
    exampleBody: 'id,metric,value\n1,p99_latency_ms,14.2\n2,qps,8500',
    desc: 'Tabular metric fixtures & data testing',
  },
  '.xml': {
    mime: 'application/xml',
    exampleBody: '<?xml version="1.0"?>\n<service status="healthy"><nodes>3</nodes></service>',
    desc: 'Legacy XML & feed payloads',
  },
};

export const PasteAsApiDemo: React.FC = () => {
  const [selectedSuffix, setSelectedSuffix] = useState<string>('.json');
  const [copied, setCopied] = useState(false);

  const active = suffixConfigs[selectedSuffix] || suffixConfigs['.json'];
  const curlCmd = `curl -i https://bin.extrabin.dev/api/v1/pastes/demo123${selectedSuffix}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(curlCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      data-testid="paste-as-api-demo"
      className="rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-5 sm:p-6 shadow-[4px_4px_0px_#17201d] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d4ca]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#e0f2fe] border border-[#0284c7] text-[#0369a1]">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-mono text-[#17201d] m-0">Paste as API Interactive Explorer</h3>
            <p className="text-xs font-mono text-[#74786f] m-0">Inspect typed suffix routing, ETags, and Content-Type negotiation</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#ebe7dc] rounded-lg border border-[#d5d0c5] text-xs font-mono">
          {Object.keys(suffixConfigs).map((suffix) => (
            <button
              key={suffix}
              type="button"
              onClick={() => setSelectedSuffix(suffix)}
              className={`px-2 py-1 rounded font-bold cursor-pointer transition-all ${
                selectedSuffix === suffix
                  ? 'bg-[#17201d] text-white shadow-sm'
                  : 'text-[#525a54] hover:text-[#17201d]'
              }`}
            >
              {suffix}
            </button>
          ))}
        </div>
      </div>

      <div className="p-2.5 rounded-lg bg-[#ebe7dc]/70 border border-[#d5d0c5] text-[11px] font-mono text-[#525a54] flex items-center justify-between">
        <span>Simulation only — runs entirely in your browser and does not call or persist data to the server.</span>
        <span className="text-[10px] bg-[#e0f2fe] text-[#0369a1] px-1.5 py-0.5 rounded border border-[#0284c7] font-bold shrink-0">
          MOCKED RESPONSE
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-[#525a54]">
          <span>Endpoint Target: <strong>/api/v1/pastes/:id{selectedSuffix}</strong></span>
          <span className="text-[11px] text-[#74786f]">{active.desc}</span>
        </div>

        <div className="relative group">
          <div className="p-3 rounded-xl bg-[#17201d] text-white font-mono text-xs flex items-center justify-between">
            <span className="text-[#c6f05b]">{curlCmd}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-[#2f3833] text-[#74786f] hover:text-white transition-all cursor-pointer"
              title="Copy curl command"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#c6f05b]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Mocked Response Inspector */}
        <div className="p-4 rounded-xl border border-[#d5d0c5] bg-white font-mono text-xs space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-[#ebe7dc] text-[11px] text-[#74786f]">
            <span>HTTP/1.1 200 OK</span>
            <span>ETag Deterministic Match</span>
          </div>
          <div className="space-y-1 text-[11.5px] text-[#2f3833]">
            <div><span className="text-[#74786f]">Content-Type:</span> <strong className="text-[#0369a1]">{active.mime}</strong></div>
            <div><span className="text-[#74786f]">ETag:</span> <code className="bg-[#f1f5f9] px-1 py-0.5 rounded">&quot;w5mD3JH9IEUXGFPe9GJlKj_M951Cmjcr0HBYaDpBXkE&quot;</code></div>
            <div><span className="text-[#74786f]">Cache-Control:</span> public, max-age=300, must-revalidate</div>
          </div>
          <div className="pt-2 border-t border-[#ebe7dc]">
            <span className="text-[10px] text-[#74786f] block mb-1">Body:</span>
            <pre className="p-2.5 rounded bg-[#faf8f2] border border-[#ebe7dc] text-[11px] overflow-x-auto text-[#17201d] m-0">
              {active.exampleBody}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
