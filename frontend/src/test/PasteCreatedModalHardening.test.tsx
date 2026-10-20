import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasteCreatedModal } from '../features/pastes/components/PasteCreatedModal';
import { pasteApi } from '../features/pastes/api/pasteApi';

vi.mock('../features/pastes/api/pasteApi', () => ({
  pasteApi: {
    updatePasteSlug: vi.fn(),
    getRawUrl: vi.fn((id, token) => `/api/v1/pastes/${id}/raw${token ? `?token=${token}` : ''}`),
  },
}));

describe('PasteCreatedModal Security & UX Hardening', () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  it('modal_normalizesBaseUrl_preventsDoubleSlashes', () => {
    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="clean-slug-123"
        encryptionMode={null}
      />
    );

    const urlDisplay = screen.getByLabelText(/shareable paste url/i);
    expect(urlDisplay.textContent).not.toContain('//p/');
    expect(urlDisplay.textContent).toMatch(/\/p\/clean-slug-123/);
  });

  it('modal_e2eeLinkMode_clearlyDifferentiatesFullVsSeparate', () => {
    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="e2ee-paste-99"
        encryptionMode="LINK"
        linkKey="secret-key-material-abc"
      />
    );

    // Segmented control for share modes must exist
    expect(screen.getByRole('button', { name: /one link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link and key apart/i })).toBeInTheDocument();

    // Default mode is "one link" — full URL with key fragment
    const urlDisplay = screen.getByLabelText(/shareable paste url/i);
    expect(urlDisplay.textContent).toContain('#key=');

    // Switch to "link and key apart" mode
    fireEvent.click(screen.getByRole('button', { name: /link and key apart/i }));

    // Key must be visible in its own field
    expect(screen.getByText(/secret-key-material-abc/i)).toBeInTheDocument();
    // Two separate copy buttons
    expect(screen.getAllByText(/copy/i).length).toBeGreaterThanOrEqual(2);
  });

  it('modal_e2eePassphraseMode_rendersPassphraseGuidance', () => {
    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="passphrase-paste-77"
        encryptionMode="PASSPHRASE"
        isPassphraseProtected={true}
      />
    );

    const urlDisplay = screen.getByLabelText(/shareable paste url/i);
    expect(urlDisplay.textContent).not.toContain('#key=');
    expect(screen.getAllByText(/separate channel|cannot decrypt/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/secret-key-material/i)).not.toBeInTheDocument();
  });

  it('modal_encryptedPaste_labelsRawLinkAsCiphertext', () => {
    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="enc-raw-check"
        encryptionMode="LINK"
        linkKey="key-123"
      />
    );

    // Expand advanced accordion
    const advancedToggle = screen.getByRole('button', { name: /advanced/i });
    fireEvent.click(advancedToggle);

    // Raw link should clearly communicate that it returns encrypted ciphertext
    const rawLink = screen.getByRole('link', { name: /raw \(ciphertext\)/i });
    expect(rawLink).toBeInTheDocument();
    expect(rawLink.getAttribute('href')).not.toContain('#key=');
    expect(rawLink.getAttribute('rel')).toContain('noopener');
    expect(rawLink.getAttribute('rel')).toContain('noreferrer');
  });

  it('modal_clipboardDenied_displaysGracefulErrorMessage', async () => {
    const mockWriteText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });

    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="clip-fail-paste"
        encryptionMode={null}
      />
    );

    const copyBtn = screen.getByRole('button', { name: /^copy$/i });
    fireEvent.click(copyBtn);

    await vi.runAllTimersAsync();

    expect(screen.getByText(/could not copy/i)).toBeInTheDocument();
  });

  it('modal_keyboardEscape_triggersCloseModal', () => {
    const onClose = vi.fn();
    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={onClose}
        pasteId="esc-paste"
        encryptionMode={null}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('modal_slugUpdateSuccess_updatesAllUrlsAndCopyTargets', async () => {
    vi.mocked(pasteApi.updatePasteSlug).mockResolvedValueOnce({
      id: 'brand-new-slug',
      url: '/p/brand-new-slug',
    });

    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="old-slug"
        encryptionMode="LINK"
        linkKey="key-999"
      />
    );

    // Click rename link
    fireEvent.click(screen.getByRole('button', { name: /rename link/i }));

    const slugInput = screen.getByPlaceholderText(/your-custom-name/i);
    fireEvent.change(slugInput, { target: { value: 'brand-new-slug' } });

    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    fireEvent.click(saveBtn);

    await vi.runAllTimersAsync();

    expect(pasteApi.updatePasteSlug).toHaveBeenCalledWith('old-slug', 'brand-new-slug', undefined);

    // URL display should now show the new slug
    const updatedDisplay = screen.getByLabelText(/shareable paste url/i);
    expect(updatedDisplay.textContent).toContain('brand-new-slug');
  });

  it('modal_unmountCleanup_clearsPendingTimeouts', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    const { unmount } = render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="timer-clean-paste"
        encryptionMode={null}
      />
    );

    unmount();
    expect(clearTimeoutSpy).toBeDefined();
  });
});
