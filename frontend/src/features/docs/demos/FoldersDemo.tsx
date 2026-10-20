import React, { useState } from 'react';
import { FolderTree, Plus, FolderOpen, Trash2, RefreshCw, CheckCircle2, ArrowRight } from 'lucide-react';

interface SimFolder {
  id: number;
  name: string;
  pastes: string[];
}

const initialFolders: SimFolder[] = [
  { id: 1, name: 'DevOps Configs', pastes: ['nginx.conf', 'docker-compose.yml'] },
  { id: 2, name: 'API Snippets', pastes: ['auth-endpoint.js'] },
];

export const FoldersDemo: React.FC = () => {
  const [folders, setFolders] = useState<SimFolder[]>(initialFolders);
  const [unfiled] = useState<string[]>(['quick-note.txt', 'todo.md']);
  const [newFolderName, setNewFolderName] = useState('');
  const [message, setMessage] = useState('');
  const [nextId, setNextId] = useState(3);

  const handleCreate = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setMessage('Folder name cannot be empty.');
      return;
    }
    if (folders.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
      setMessage(`A folder named "${trimmed}" already exists.`);
      return;
    }
    setFolders([...folders, { id: nextId, name: trimmed, pastes: [] }]);
    setNextId(nextId + 1);
    setNewFolderName('');
    setMessage(`Folder "${trimmed}" created.`);
  };

  const handleDelete = (id: number) => {
    const folder = folders.find((f) => f.id === id);
    if (folder) {
      setFolders(folders.filter((f) => f.id !== id));
      setMessage(`Folder "${folder.name}" deleted. ${folder.pastes.length} paste(s) moved to Unfiled.`);
    }
  };

  const handleReset = () => {
    setFolders(initialFolders);
    setNewFolderName('');
    setMessage('');
    setNextId(3);
  };

  return (
    <div
      data-testid="folders-demo"
      className="rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-5 sm:p-6 shadow-[4px_4px_0px_#17201d] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d4ca]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#fef3c7] border border-[#d97706] text-[#b45309]">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-mono text-[#17201d] m-0">Folder Management Simulator</h3>
            <p className="text-xs font-mono text-[#74786f] m-0">Create, organize, and manage paste folders</p>
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
        <span className="text-[10px] bg-[#fef3c7] text-[#b45309] px-1.5 py-0.5 rounded border border-[#d97706] font-bold shrink-0">
          SIMULATION
        </span>
      </div>

      <div className="p-4 rounded-xl border border-[#d5d0c5] bg-white space-y-4 font-mono text-xs">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="New folder name..."
            className="flex-1 px-3 py-2 rounded-lg border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono text-[#17201d] placeholder:text-[#74786f] focus:outline-none focus:ring-2 focus:ring-[#d97706]"
            aria-label="New folder name"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="px-3 py-2 rounded-lg bg-[#d97706] text-white font-bold text-xs hover:bg-[#b45309] transition-all cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_#17201d]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create</span>
          </button>
        </div>

        {message && (
          <div className="p-2.5 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px]">{message}</span>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[11px] font-bold text-[#74786f] uppercase tracking-wider">Your Folders</div>
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center justify-between p-3 rounded-lg border border-[#d5d0c5] bg-[#faf8f2] hover:border-[#d97706] transition-colors"
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#d97706]" />
                <span className="font-bold text-[#17201d]">{folder.name}</span>
                <span className="text-[10px] text-[#74786f] bg-[#ebe7dc] px-1.5 py-0.5 rounded">
                  {folder.pastes.length} paste{folder.pastes.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(folder.id)}
                className="p-1.5 rounded-md text-[#991b1b] hover:bg-[#fee2e2] transition-colors cursor-pointer"
                aria-label={`Delete folder ${folder.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-2 border-t border-[#d8d4ca]">
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#74786f] uppercase tracking-wider">
            <span>Unfiled</span>
            <ArrowRight className="w-3 h-3" />
            <span className="text-[10px] font-normal normal-case text-[#525a54]">
              {unfiled.length} paste{unfiled.length !== 1 ? 's' : ''} not in any folder
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unfiled.map((paste) => (
              <span key={paste} className="px-2 py-1 rounded-md bg-[#ebe7dc] text-[11px] text-[#525a54] border border-[#d5d0c5]">
                {paste}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
