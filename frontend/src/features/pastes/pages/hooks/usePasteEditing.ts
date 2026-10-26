import { useState, useRef } from 'react';
import type { PasteFileItem } from '../../types/paste';

export interface UsePasteEditingReturn {
  isEditing: boolean;
  isSaving: boolean;
  editError: string | null;
  showDiscardConfirm: boolean;
  workspaceDraftFiles: PasteFileItem[];
  isDirtyRef: React.MutableRefObject<boolean>;
  isSidebarCollapsed: boolean;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setEditError: React.Dispatch<React.SetStateAction<string | null>>;
  setShowDiscardConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkspaceDraftFiles: React.Dispatch<React.SetStateAction<PasteFileItem[]>>;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

export const usePasteEditing = (): UsePasteEditingReturn => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [workspaceDraftFiles, setWorkspaceDraftFiles] = useState<PasteFileItem[]>([]);
  const isDirtyRef = useRef(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return {
    isEditing,
    isSaving,
    editError,
    showDiscardConfirm,
    workspaceDraftFiles,
    isDirtyRef,
    isSidebarCollapsed,
    setIsEditing,
    setIsSaving,
    setEditError,
    setShowDiscardConfirm,
    setWorkspaceDraftFiles,
    setIsSidebarCollapsed,
  };
};
