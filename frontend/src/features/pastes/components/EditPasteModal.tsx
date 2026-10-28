import React, { useState, useMemo } from 'react';
import { Icon } from '../../../components/ui/PaperIcon';
import { Select, SelectOption } from '../../../components/ui/Select';
import { accountApi } from '../../dashboard/api/accountApi';
import { PasteView, Visibility } from '../types/paste';
import { LANGUAGES } from './CreatePasteForm';
import { ApiError } from '../../../lib/api-client/client';

interface EditPasteModalProps {
  paste: PasteView;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: PasteView) => void;
}

export const EditPasteModal: React.FC<EditPasteModalProps> = ({
  paste,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState(paste.title || '');
  const [content, setContent] = useState(paste.content);
  const [language, setLanguage] = useState(paste.language);
  const [visibility, setVisibility] = useState<Visibility>(paste.visibility);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const languageOptions: SelectOption[] = useMemo(() => {
    return LANGUAGES.map((l) => ({ value: l.value, label: l.label }));
  }, []);

  const visibilityOptions: SelectOption<Visibility>[] = useMemo(() => [
    { value: 'PUBLIC', label: 'Public', description: 'Visible in Explore' },
    { value: 'UNLISTED', label: 'Unlisted', description: 'Secret link only' },
    { value: 'PRIVATE', label: 'Private', description: 'Your account only' },
  ], []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setErrorMessage('Content cannot be blank.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await accountApi.editPaste(paste.id, {
        title: title.trim() || undefined,
        content,
        language,
        visibility,
        version: paste.version,
      });
      onSuccess(updated as unknown as PasteView);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setErrorMessage('Concurrent update collision: Another update occurred. Please refresh this page to inspect the latest changes.');
        } else {
          setErrorMessage(err.detail);
        }
      } else {
        setErrorMessage('Failed to save changes.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-modal-title"
        className="modal-paper modal-wide"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#d5d0c5]">
          <div className="flex items-center gap-2.5 text-[#17201d]">
            <div className="p-1.5 rounded-lg bg-[#ff5c3d] text-[#17201d]">
              <Icon name="edit" size={16} />
            </div>
            <h2 id="edit-modal-title" className="text-base font-bold m-0 font-mono">
              Edit Paste <span className="text-xs text-[#74786f]">({paste.id})</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#74786f] hover:text-[#17201d] hover:bg-[#ebe7dc] transition-colors"
            aria-label="Close edit modal"
          >
            &times;
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-lg bg-red-100 border border-red-800 text-red-900 text-xs flex items-center gap-2">
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#74786f] uppercase tracking-wider mb-1 font-mono">
              Title or Filename
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="Untitled paste (optional)"
              className="controls-input font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#74786f] uppercase tracking-wider mb-1 font-mono">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={11}
              className="w-full p-3.5 bg-[#151b19] border border-[#2a322f] rounded-xl font-mono text-xs text-[#dce7df] placeholder-[#74776f] focus:outline-none focus:border-[#ff5c3d]"
              required
            />
          </div>

          <div className="u-form-grid modal-form-grid gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#74786f] uppercase tracking-wider mb-1 font-mono">
                Language
              </label>
              <Select
                value={language}
                onChange={setLanguage}
                options={languageOptions}
                searchable
                menuWidth={220}
                ariaLabel="Paste language"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#74786f] uppercase tracking-wider mb-1 font-mono">
                Visibility
              </label>
              <Select<Visibility>
                value={visibility}
                onChange={setVisibility}
                options={visibilityOptions}
                ariaLabel="Paste visibility"
              />
            </div>
          </div>

          <div className="modal-actions border-t border-[#d5d0c5] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#d5d0c5] rounded-lg bg-white text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-[#ff5c3d] text-[#17201d] text-xs font-bold shadow-[2px_3px_0px_#17201d] hover:translate-x-[-1px] hover:translate-y-[-1px] disabled:opacity-50 transition-all"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
