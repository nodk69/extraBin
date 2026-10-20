import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CreatePastePage } from '../features/pastes/pages/CreatePastePage';
import { AuthProvider } from '../features/auth/context/AuthContext';

function renderCreatePage() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <CreatePastePage />
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('Direct File Uploads', () => {
  it('renders upload button and hidden file input', () => {
    renderCreatePage();

    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload files from disk/i)).toBeInTheDocument();
  });

  it('shows dropzone overlay when dragging files over the editor', () => {
    renderCreatePage();

    const editorShell = document.querySelector('.editor-shell');
    expect(editorShell).toBeInTheDocument();

    fireEvent.dragEnter(editorShell!, {
      dataTransfer: { items: [{ kind: 'file', type: 'text/plain' }] },
    });

    expect(screen.getByText(/drop files here to upload/i)).toBeInTheDocument();

    fireEvent.dragLeave(editorShell!);
    expect(screen.queryByText(/drop files here to upload/i)).not.toBeInTheDocument();
  });

  it('uploads a valid text file and sets file content and language', async () => {
    renderCreatePage();

    const fileInput = screen.getByLabelText(/upload files from disk/i) as HTMLInputElement;
    const file = new File(['console.log("hello world");'], 'app.js', { type: 'text/javascript' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('app.js')).toBeInTheDocument();
    });
  });

  it('rejects binary file containing NUL bytes safely', async () => {
    renderCreatePage();

    const fileInput = screen.getByLabelText(/upload files from disk/i) as HTMLInputElement;
    const binaryData = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x02, 0x01]);
    const binaryFile = new File([binaryData], 'program.bin', { type: 'application/octet-stream' });

    fireEvent.change(fileInput, { target: { files: [binaryFile] } });

    await waitFor(() => {
      expect(screen.getByText(/is a binary file/i)).toBeInTheDocument();
    });
  });

  it('rejects files exceeding 1 MB limit', async () => {
    renderCreatePage();

    const fileInput = screen.getByLabelText(/upload files from disk/i) as HTMLInputElement;
    const largeContent = 'a'.repeat(1024 * 1024 + 500);
    const largeFile = new File([largeContent], 'large.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/exceeds the maximum allowed limit of 1 MB/i)).toBeInTheDocument();
    });
  });
});
