import React, { useEffect, useState } from 'react';
import { Icon } from '../../../components/ui/PaperIcon';
import { RevisionHistorySkeleton } from '../../../components/ui/SkeletonLayouts';
import { accountApi, PasteRevision } from '../../dashboard/api/accountApi';

interface RevisionHistoryModalProps {
  pasteId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const RevisionHistoryModal: React.FC<RevisionHistoryModalProps> = ({
  pasteId,
  isOpen,
  onClose,
}) => {
  const [revisions, setRevisions] = useState<PasteRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRevision, setSelectedRevision] = useState<PasteRevision | null>(null);

  useEffect(() => {
    if (!isOpen || !pasteId) return;
    setLoading(true);
    accountApi
      .getRevisions(pasteId)
      .then((data) => {
        setRevisions(data);
        if (data.length > 0) setSelectedRevision(data[0]);
      })
      .catch(() => setRevisions([]))
      .finally(() => setLoading(false));
  }, [isOpen, pasteId]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="revision-modal-title"
        className="modal-paper modal-wide max-w-4xl"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#d5d0c5] shrink-0">
          <div className="flex items-center gap-2.5 text-[#17201d]">
            <div className="p-1.5 rounded-lg bg-[#c6f05b] text-[#17201d]">
              <Icon name="history" size={16} />
            </div>
            <h2 id="revision-modal-title" className="text-base font-bold m-0 font-mono">
              Revision History <span className="text-xs text-[#74786f]">({pasteId})</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#74786f] hover:text-[#17201d] hover:bg-[#ebe7dc] transition-colors"
            aria-label="Close revision modal"
          >
            &times;
          </button>
        </div>

        {loading ? (
          <RevisionHistorySkeleton />
        ) : revisions.length === 0 ? (
          <div className="py-16 text-center font-mono text-xs text-[#74786f]">
            No previous revisions recorded for this paste.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
            {/* Revision List */}
            <div className="space-y-2 overflow-y-auto pr-2 border-r border-[#d5d0c5]">
              {revisions.map((rev: PasteRevision) => (
                <button
                  key={rev.id}
                  type="button"
                  onClick={() => setSelectedRevision(rev)}
                  className={`w-full text-left p-3 rounded-xl border transition-all text-xs space-y-1.5 ${
                    selectedRevision?.id === rev.id
                      ? 'border-[#17201d] bg-[#17201d] text-white shadow-[2px_3px_0_#d5d0c5]'
                      : 'border-[#d5d0c5] bg-white text-[#5a645f] hover:border-[#17201d] hover:text-[#17201d]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono">Version {rev.version}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#ebe7dc] text-[#17201d] border border-[#d5d0c5]">
                      {rev.language}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] opacity-80 font-mono">
                    <Icon name="clock" size={11} />
                    <span>{new Date(rev.createdAt).toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Selected Revision Content Preview */}
            <div className="md:col-span-2 rounded-xl border border-[#2a322f] bg-[#151b19] p-4 font-mono text-xs overflow-y-auto text-[#dce7df] whitespace-pre">
              {selectedRevision?.content || 'No content recorded'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
