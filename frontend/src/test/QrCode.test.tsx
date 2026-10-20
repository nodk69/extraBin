import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QrCodeModal from '../features/pastes/components/QrCodeModal';
import QRCode from 'qrcode';

vi.mock('qrcode', () => ({
  default: {
    toCanvas: vi.fn((_canvas, _text, _options, callback) => {
      if (callback) callback(null);
    }),
  },
}));

describe('Feature 5: QR Code Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates QR code canvas with canonical URL only and never encodes secrets', async () => {
    const handleClose = vi.fn();
    render(
      <QrCodeModal
        isOpen={true}
        onClose={handleClose}
        pasteId="canonical-paste-456"
        pasteTitle="Database Config"
      />
    );

    expect(screen.getByText('Share via QR Code')).toBeInTheDocument();
    expect(screen.getByText(/"Database Config"/)).toBeInTheDocument();

    await waitFor(() => {
      expect(QRCode.toCanvas).toHaveBeenCalled();
    });

    const callArgs = (QRCode.toCanvas as any).mock.calls[0];
    const encodedUrl = callArgs[1];
    expect(encodedUrl).toContain('/p/canonical-paste-456');
    expect(encodedUrl).not.toContain('secret');
    expect(encodedUrl).not.toContain('password');

    // Input displays canonical URL
    const urlInput = screen.getByRole('textbox') as HTMLInputElement;
    expect(urlInput.value).toContain('/p/canonical-paste-456');
  });

  it('copies canonical URL to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <QrCodeModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="copy-qr-id"
      />
    );

    const copyBtn = screen.getByRole('button', { name: /Copy/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('/p/copy-qr-id'));
      expect(screen.getByText('Copied')).toBeInTheDocument();
    });
  });

  it('handles download PNG button click without throwing', () => {
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA');

    render(
      <QrCodeModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="download-qr-id"
        pasteTitle="App Spec"
      />
    );

    const downloadBtn = screen.getByRole('button', { name: /Download PNG/i });
    expect(downloadBtn).toBeInTheDocument();
    fireEvent.click(downloadBtn);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png');
  });
});
