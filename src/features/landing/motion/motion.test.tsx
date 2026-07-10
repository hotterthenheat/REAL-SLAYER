import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DUR, TRIGGER } from './motionTokens';
import { resolveMode } from './useMotionMode';
import { KineticHeadline } from '../components/KineticHeadline';

describe('motion tokens', () => {
  it('trigger ids are unique and namespaced', () => {
    const ids = Object.values(TRIGGER);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id.startsWith('landing-')).toBe(true));
  });

  it('durations ascend from instant to cinematic', () => {
    expect(DUR.instant).toBeLessThan(DUR.fast);
    expect(DUR.fast).toBeLessThan(DUR.normal);
    expect(DUR.normal).toBeLessThan(DUR.reveal);
    expect(DUR.reveal).toBeLessThan(DUR.cinematic);
  });
});

describe('responsive motion mode', () => {
  it('maps viewport width to the right tier', () => {
    expect(resolveMode(360)).toBe('mobile');
    expect(resolveMode(639)).toBe('mobile');
    expect(resolveMode(640)).toBe('tablet');
    expect(resolveMode(1023)).toBe('tablet');
    expect(resolveMode(1024)).toBe('desktop');
    expect(resolveMode(2560)).toBe('desktop');
  });
});

describe('KineticHeadline (reduced-motion content)', () => {
  it('renders every statement line and an accessible transcript', () => {
    const lines = ['READ THE FLOW', 'SEE THE PRESSURE', 'TRADE THE STRUCTURE'];
    render(<KineticHeadline lines={lines} />);
    // visual lines present…
    lines.forEach((l) => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
    // …plus an sr-only transcript so the statement is never hidden from AT / reduced motion
    expect(screen.getByText('READ THE FLOW. SEE THE PRESSURE. TRADE THE STRUCTURE')).toBeTruthy();
  });

  it('tags alternating lines with opposite travel directions', () => {
    const { container } = render(<KineticHeadline lines={['A', 'B', 'C']} />);
    const dirs = Array.from(container.querySelectorAll('[data-kinetic-line]')).map((n) => n.getAttribute('data-dir'));
    expect(dirs).toEqual(['1', '-1', '1']);
  });
});
