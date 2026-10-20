import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select, SelectOption } from '../components/ui/Select';

describe('Select Component', () => {
  const options: SelectOption[] = [
    { value: 'js', label: 'JavaScript', hint: '.js', description: 'ECMAScript standard' },
    { value: 'ts', label: 'TypeScript', hint: '.ts', description: 'Typed JavaScript' },
    { value: 'py', label: 'Python', hint: '.py', description: 'Dynamic language' },
    { value: 'dis', label: 'Disabled Option', disabled: true },
  ];

  it('renders with the selected value label', () => {
    render(<Select value="js" onChange={vi.fn()} options={options} ariaLabel="Language selector" />);
    expect(screen.getByRole('combobox', { name: /language selector/i })).toHaveTextContent('JavaScript');
  });

  it('renders placeholder when no option is selected', () => {
    render(<Select value="" onChange={vi.fn()} options={options} placeholder="Choose an option" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose an option');
  });

  it('opens options popover on click and selects an option', () => {
    const handleChange = vi.fn();
    render(<Select value="js" onChange={handleChange} options={options} />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const tsOption = screen.getByText('TypeScript');
    expect(tsOption).toBeInTheDocument();
    expect(screen.getByText('Typed JavaScript')).toBeInTheDocument();

    fireEvent.click(tsOption);
    expect(handleChange).toHaveBeenCalledWith('ts');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('supports search filtering when searchable is true', () => {
    render(<Select value="js" onChange={vi.fn()} options={options} searchable />);

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    const searchInput = screen.getByPlaceholderText('Filter…');
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'py' } });
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.queryByText('TypeScript')).not.toBeInTheDocument();
  });

  it('navigates with keyboard and selects with Enter', () => {
    const handleChange = vi.fn();
    render(<Select value="js" onChange={handleChange} options={options} />);

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    // ArrowDown to move to TypeScript
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith('ts');
  });

  it('closes popover on Escape', () => {
    render(<Select value="js" onChange={vi.fn()} options={options} />);

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
