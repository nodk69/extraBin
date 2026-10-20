import React, { useState } from 'react';
import { Layers, FileCode, Download } from 'lucide-react';

const mockFiles = [
  { name: 'main.go', lang: 'Go', content: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("ExtraBin Workspace")\n}' },
  { name: 'go.mod', lang: 'Mod', content: 'module example.com/extrabin-demo\n\ngo 1.22' },
  { name: 'README.md', lang: 'Markdown', content: '# Demo Service\nRun `go run main.go` to test execution.' },
];

export const MultiFileDemo: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div
      data-testid="multi-file-demo"
      className="rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-5 sm:p-6 shadow-[4px_4px_0px_#17201d] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d4ca]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#f3e8ff] border border-[#a855f7] text-[#7e22ce]">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-mono text-[#17201d] m-0">Multi-File Workspace Simulator</h3>
            <p className="text-xs font-mono text-[#74786f] m-0">Inspect multi-tab snippet packaging, tab switching, and unified ZIP exports</p>
          </div>
        </div>
        <span className="text-xs font-mono text-[#74786f]">3 files bundled</span>
      </div>

      <div className="p-2.5 rounded-lg bg-[#ebe7dc]/70 border border-[#d5d0c5] text-[11px] font-mono text-[#525a54] flex items-center justify-between">
        <span>Simulation only — runs entirely in your browser and does not call or persist data to the server.</span>
        <span className="text-[10px] bg-[#f3e8ff] text-[#7e22ce] px-1.5 py-0.5 rounded border border-[#a855f7] font-bold shrink-0">
          CLIENT WORKSPACE
        </span>
      </div>

      <div className="rounded-xl border border-[#d5d0c5] bg-white overflow-hidden font-mono text-xs">
        <div className="flex items-center justify-between bg-[#ebe7dc] px-2 pt-2 border-b border-[#d5d0c5]">
          <div className="flex items-center gap-1 overflow-x-auto">
            {mockFiles.map((file, idx) => (
              <button
                key={file.name}
                type="button"
                onClick={() => setActiveTab(idx)}
                className={`px-3 py-1.5 rounded-t-lg font-bold flex items-center gap-1.5 text-xs transition-all cursor-pointer ${
                  activeTab === idx
                    ? 'bg-white text-[#17201d] border-t-2 border-t-[#ff5c3d] shadow-sm'
                    : 'text-[#74786f] hover:text-[#17201d]'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{file.name}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="text-[11px] text-[#525a54] hover:text-[#17201d] flex items-center gap-1 pb-1 cursor-default"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Simulate ZIP</span>
          </button>
        </div>

        <div className="p-4 bg-white">
          <div className="flex items-center justify-between text-[11px] text-[#74786f] pb-2 border-b border-[#ebe7dc] mb-2">
            <span>Viewing: {mockFiles[activeTab].name}</span>
            <span>Syntax: {mockFiles[activeTab].lang}</span>
          </div>
          <pre className="p-3 rounded bg-[#faf8f2] border border-[#ebe7dc] text-[11px] text-[#17201d] overflow-x-auto m-0">
            {mockFiles[activeTab].content}
          </pre>
        </div>
      </div>
    </div>
  );
};
