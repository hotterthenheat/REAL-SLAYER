import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveValue, LiveDot } from './LiveValue';

describe('LiveValue', () => {
  it('renders the formatted value', () => {
    render(<LiveValue value={1234.5} />);
    expect(screen.getByText('1,234.5')).toBeInTheDocument();
  });

  it('shows the placeholder for null/undefined', () => {
    render(<LiveValue value={null} placeholder="—" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('does not flash on first render (only on change)', () => {
    const { container } = render(<LiveValue value={10} />);
    const span = container.querySelector('span');
    expect(span?.className).not.toMatch(/slv-flash/);
  });

  it('flashes green when the value increases', () => {
    const { container, rerender } = render(<LiveValue value={10} />);
    rerender(<LiveValue value={12} />);
    const span = container.querySelector('span');
    expect(span?.className).toMatch(/slv-flash-up/);
  });

  it('flashes red when the value decreases', () => {
    const { container, rerender } = render(<LiveValue value={10} />);
    rerender(<LiveValue value={8} />);
    const span = container.querySelector('span');
    expect(span?.className).toMatch(/slv-flash-down/);
  });

  it('flashes neutral for non-numeric changes', () => {
    const { container, rerender } = render(<LiveValue value="TRENDING" />);
    rerender(<LiveValue value="RANGING" />);
    const span = container.querySelector('span');
    expect(span?.className).toMatch(/slv-flash-neutral/);
  });

  it('uses a custom formatter for display', () => {
    render(<LiveValue value={0.5} format={(v) => `${(v as number) * 100}%`} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});

describe('LiveDot', () => {
  it('renders its label', () => {
    render(<LiveDot state="live" label="LIVE" />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
