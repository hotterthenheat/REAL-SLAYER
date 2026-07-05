import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Progress } from './Progress';

describe('Progress', () => {
  it('exposes progressbar semantics with the clamped value', () => {
    render(<Progress value={42} ariaLabel="Export" />);
    const bar = screen.getByRole('progressbar', { name: 'Export' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps values above 100', () => {
    render(<Progress value={250} ariaLabel="Over" />);
    expect(screen.getByRole('progressbar', { name: 'Over' })).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps negative values to 0', () => {
    render(<Progress value={-10} ariaLabel="Under" />);
    expect(screen.getByRole('progressbar', { name: 'Under' })).toHaveAttribute('aria-valuenow', '0');
  });
});
