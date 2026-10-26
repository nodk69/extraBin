import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownMenuContent,
} from '../components/ui/dropdown/DropdownMenu';
import { NativeSelect } from '../components/ui/dropdown/NativeSelect';

describe('Centralized Dropdown System', () => {
  describe('DropdownMenu', () => {
    it('opens and closes via trigger click', () => {
      render(
        <DropdownMenu>
          <DropdownTrigger aria-label="Test menu">Trigger</DropdownTrigger>
          <DropdownMenuContent>
            <button type="button">Item 1</button>
            <button type="button">Item 2</button>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /test menu/i });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Item 1')).not.toBeInTheDocument();

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Item 1')).toBeInTheDocument();

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
    });

    it('closes on Escape and restores focus to trigger', () => {
      render(
        <DropdownMenu>
          <DropdownTrigger aria-label="Options menu">Open Menu</DropdownTrigger>
          <DropdownMenuContent>
            <button type="button">Action A</button>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /options menu/i });
      fireEvent.click(trigger);
      expect(screen.getByText('Action A')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('Action A')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it('navigates menu items with ArrowUp and ArrowDown', () => {
      render(
        <DropdownMenu>
          <DropdownTrigger aria-label="Navigation">Open Nav</DropdownTrigger>
          <DropdownMenuContent>
            <a href="#first">First</a>
            <a href="#second">Second</a>
            <a href="#third">Third</a>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /navigation/i });
      fireEvent.click(trigger);

      const links = screen.getAllByRole('link');
      expect(links.length).toBe(3);

      // First item auto-focused on open
      expect(document.activeElement).toBe(links[0]);

      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(links[1]);

      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(links[2]);

      fireEvent.keyDown(window, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(links[1]);
    });
  });

  describe('NativeSelect', () => {
    it('renders with options and triggers onChange', () => {
      const handleChange = vi.fn();
      const options = [
        { value: 'opt1', label: 'Option 1' },
        { value: 'opt2', label: 'Option 2' },
      ];

      render(
        <NativeSelect
          aria-label="Test select"
          value="opt1"
          onChange={handleChange}
          options={options}
        />
      );

      const select = screen.getByRole('combobox', { name: /test select/i });
      expect(select).toHaveValue('opt1');

      fireEvent.change(select, { target: { value: 'opt2' } });
      expect(handleChange).toHaveBeenCalledWith('opt2', expect.anything());
    });

    it('handles numeric values correctly', () => {
      const handleChange = vi.fn();
      const options = [
        { value: 1, label: 'Version 1' },
        { value: 2, label: 'Version 2' },
      ];

      render(
        <NativeSelect
          aria-label="Version select"
          value={1}
          onChange={handleChange}
          options={options}
        />
      );

      const select = screen.getByRole('combobox', { name: /version select/i });
      expect(select).toHaveValue('1');

      fireEvent.change(select, { target: { value: '2' } });
      expect(handleChange).toHaveBeenCalledWith(2, expect.anything());
    });
  });

  describe('Responsive & Viewport Behavior', () => {
    const viewports = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440];

    viewports.forEach((vpWidth) => {
      it(`DropdownMenu maintains viewport width constraints at ${vpWidth}px`, () => {
        Object.defineProperty(window, 'innerWidth', { value: vpWidth, writable: true });
        window.dispatchEvent(new Event('resize'));

        render(
          <DropdownMenu>
            <DropdownTrigger aria-label="Responsive menu">Menu</DropdownTrigger>
            <DropdownMenuContent data-testid="menu-content">
              <button type="button">Item A</button>
              <button type="button">Item B</button>
            </DropdownMenuContent>
          </DropdownMenu>
        );

        const trigger = screen.getByRole('button', { name: /responsive menu/i });
        fireEvent.click(trigger);

        const content = screen.getByTestId('menu-content');
        expect(content).toBeInTheDocument();
        expect(content.style.maxWidth).toBe('calc(100vw - 16px)');
        expect(content.style.overflowY).toBe('auto');
      });
    });
  });
});
