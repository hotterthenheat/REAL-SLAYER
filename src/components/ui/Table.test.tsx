import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table, TBody, TR, TD } from './Table';

function renderRow(props: { interactive?: boolean; onClick?: () => void }) {
  return render(
    <Table bare>
      <TBody>
        <TR interactive={props.interactive} onClick={props.onClick} aria-label="row">
          <TD>cell</TD>
        </TR>
      </TBody>
    </Table>,
  );
}

describe('Table TR keyboard a11y', () => {
  it('makes interactive rows focusable', () => {
    renderRow({ interactive: true, onClick: () => {} });
    expect(screen.getByRole('row', { name: 'row' })).toHaveAttribute('tabindex', '0');
  });

  it('does not make plain rows focusable', () => {
    renderRow({ interactive: false });
    expect(screen.getByRole('row', { name: 'row' })).not.toHaveAttribute('tabindex');
  });

  it('fires onClick when Enter is pressed on an interactive row', async () => {
    const onClick = vi.fn();
    renderRow({ interactive: true, onClick });
    const row = screen.getByRole('row', { name: 'row' });
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick when Space is pressed on an interactive row', async () => {
    const onClick = vi.fn();
    renderRow({ interactive: true, onClick });
    screen.getByRole('row', { name: 'row' }).focus();
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
