import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loading } from '../components/ui/Loading';

describe('Loading Component', () => {
  it('renders default page loading variant with accessible role', () => {
    render(<Loading message="Loading workbench..." submessage="Preparing workspace" />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(screen.getByText('Loading workbench...')).toBeInTheDocument();
    expect(screen.getByText('Preparing workspace')).toBeInTheDocument();
  });

  it('renders card variant', () => {
    render(<Loading variant="card" message="Syncing repository..." />);
    expect(screen.getByRole('status')).toHaveClass('account-table-card');
    expect(screen.getByText('Syncing repository...')).toBeInTheDocument();
  });

  it('renders inline variant with dot or spinner', () => {
    render(<Loading variant="inline" icon="dot" message="Loading discussion..." />);
    const status = screen.getByRole('status');
    expect(status).toHaveClass('inline-flex');
    expect(screen.getByText('Loading discussion...')).toBeInTheDocument();
  });

  it('renders minimal variant with screen-reader text', () => {
    render(<Loading variant="minimal" message="Screen reader only" />);
    expect(screen.getByText('Screen reader only')).toBeInTheDocument();
  });
});
