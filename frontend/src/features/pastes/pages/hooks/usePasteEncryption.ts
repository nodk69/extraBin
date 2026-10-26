import { useState } from 'react';
import { decryptPaste, type DecryptedFile, type EncryptedPasteViewDTO } from '../../../../lib/crypto/e2ePaste';
import { pasteApi } from '../../api/pasteApi';
import { ApiError } from '../../../../lib/api-client/client';
import { triggerConfetti } from '../../../../lib/confetti';
import type { PasteView } from '../../types/paste';
import { hasRecentlyViewed, markViewed } from './usePasteView';

export const buildViewDTO = (p: PasteView): EncryptedPasteViewDTO => {
  return {
    id: p.id,
    encryptionMode: p.encryptionMode!,
    kdfSalt: p.kdfSalt || '',
    kdfIterations: p.kdfIterations || 600000,
    wrappedKey: p.wrappedKey ?? null,
    burnAfterReading: !!(p.burnAfterReading || p.viewOnce),
    files: (p.files || []).map((f) => ({
      id: f.id,
      filename: f.filename,
      nonce: f.nonce || '',
      ciphertext: f.ciphertext || '',
      authTag: f.authTag || '',
    })),
  };
};

export interface UsePasteEncryptionReturn {
  decryptedFiles: DecryptedFile[] | null;
  isE2eDecrypting: boolean;
  e2eDecryptError: string | null;
  enteredE2eCredential: string;
  showEnteredE2eCredential: boolean;
  enteredPassword: string;
  showEnteredPassword: boolean;
  unlockError: string | null;
  isUnlocking: boolean;
  setDecryptedFiles: React.Dispatch<React.SetStateAction<DecryptedFile[] | null>>;
  setE2eDecryptError: React.Dispatch<React.SetStateAction<string | null>>;
  setEnteredE2eCredential: React.Dispatch<React.SetStateAction<string>>;
  setShowEnteredE2eCredential: React.Dispatch<React.SetStateAction<boolean>>;
  setEnteredPassword: React.Dispatch<React.SetStateAction<string>>;
  setShowEnteredPassword: React.Dispatch<React.SetStateAction<boolean>>;
  setUnlockError: React.Dispatch<React.SetStateAction<string | null>>;
  handleManualDecrypt: (e: React.FormEvent, paste: PasteView | null, id: string) => Promise<void>;
  handleUnlockPassword: (e: React.FormEvent, id: string, shareToken: string | null, setPaste: (p: PasteView) => void, setShareToken: (t: string) => void) => Promise<void>;
  attemptAutoDecrypt: (paste: PasteView, id: string) => void;
}

export const usePasteEncryption = (): UsePasteEncryptionReturn => {
  const [decryptedFiles, setDecryptedFiles] = useState<DecryptedFile[] | null>(null);
  const [isE2eDecrypting, setIsE2eDecrypting] = useState(false);
  const [e2eDecryptError, setE2eDecryptError] = useState<string | null>(null);
  const [enteredE2eCredential, setEnteredE2eCredential] = useState('');
  const [showEnteredE2eCredential, setShowEnteredE2eCredential] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [showEnteredPassword, setShowEnteredPassword] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const attemptAutoDecrypt = (paste: PasteView, id: string) => {
    if (!paste.encryptionMode) return;

    const hash = window.location.hash;
    let linkKey: string | null = null;
    if (hash.startsWith('#key=')) {
      linkKey = decodeURIComponent(hash.substring(5));
    }

    if (linkKey) {
      setIsE2eDecrypting(true);
      setE2eDecryptError(null);
      decryptPaste(buildViewDTO(paste), linkKey)
        .then((decrypted) => {
          setDecryptedFiles(decrypted);
          triggerConfetti();
        })
        .catch((err) => {
          console.error('Auto decrypt error:', err);
          pasteApi.reportDecryptFailed(id);
          setE2eDecryptError("We couldn't decrypt this paste. Possible causes include an incorrect key, an incomplete link, or corrupted encrypted data.");
        })
        .finally(() => {
          setIsE2eDecrypting(false);
        });
    }
  };

  const handleManualDecrypt = async (e: React.FormEvent, paste: PasteView | null, id: string) => {
    e.preventDefault();
    if (!paste || !enteredE2eCredential.trim() || !id) return;

    setIsE2eDecrypting(true);
    setE2eDecryptError(null);
    try {
      const decrypted = await decryptPaste(buildViewDTO(paste), enteredE2eCredential.trim());
      setDecryptedFiles(decrypted);
      if (!paste.viewOnce) {
        markViewed(id);
      }
      triggerConfetti();
    } catch (err) {
      console.error('Manual decrypt error:', err);
      pasteApi.reportDecryptFailed(id);
      setE2eDecryptError('Decryption failed. Incorrect passphrase or key.');
    } finally {
      setIsE2eDecrypting(false);
    }
  };

  const handleUnlockPassword = async (
    e: React.FormEvent,
    id: string,
    shareToken: string | null,
    setPaste: (p: PasteView) => void,
    setShareToken: (t: string) => void
  ) => {
    e.preventDefault();
    if (!id || !enteredPassword.trim()) return;

    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const skipCount = hasRecentlyViewed(id);
      const unlockedPaste = await pasteApi.getPaste(id, enteredPassword.trim(), skipCount, shareToken || undefined);
      setPaste(unlockedPaste);
      if (unlockedPaste.shareToken) {
        setShareToken(unlockedPaste.shareToken);
      }
      if (!unlockedPaste.viewOnce) {
        markViewed(id);
      }
      triggerConfetti();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setUnlockError(err.detail);
      } else {
        setUnlockError('Incorrect password. Please verify and try again.');
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  return {
    decryptedFiles,
    isE2eDecrypting,
    e2eDecryptError,
    enteredE2eCredential,
    showEnteredE2eCredential,
    enteredPassword,
    showEnteredPassword,
    unlockError,
    isUnlocking,
    setDecryptedFiles,
    setE2eDecryptError,
    setEnteredE2eCredential,
    setShowEnteredE2eCredential,
    setEnteredPassword,
    setShowEnteredPassword,
    setUnlockError,
    handleManualDecrypt,
    handleUnlockPassword,
    attemptAutoDecrypt,
  };
};
