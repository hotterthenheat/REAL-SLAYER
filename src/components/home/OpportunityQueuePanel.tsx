/**
 * OpportunityQueuePanel — the discovery queue shared with SkyVision, rendered as a
 * dense scannable table with a category tab row. Rows are built from the engine's
 * `discovery` shelves (mispriced calls/puts, most-improved, near-invalidation); the
 * data is the scanner's MODEL/SAMPLE set, so the panel is badged as such and any
 * unsourceable cell (live price, per-row time) renders "—" rather than a fabrication.
 */
import { useMemo, useState } from 'react';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { DataClassificationLabel } from '../ui/terminal/DataClassificationLabel';
import { Badge, FooterLink, Th } from './ui';
import { fmtLevel, fmtPrice2, fmtPct, signTone, toneText, type Tone } from './format';

type Category = 'ALL' | 'BREAKOUTS' | 'REVERSALS' | 'GAMMA PLAYS' | 'EARNINGS';
const TABS: Category[] = ['ALL', 'BREAKOUTS', 'REVERSALS', 'GAMMA PLAYS', 'EARNINGS'];

interface QueueRow {
  key: string;
  ticker: string;
  setup: string;
  type: string;
  category: Exclude<Category, 'ALL'>;
  level: number | null;
  price: number | null;
  conf: number;
  risk: number | null;
  status: string;
  statusTone: Tone;
}

interface Discovery {
  mispricedCalls?: any[];
  mispricedPuts?: any[];
  mostImproved?: any[];
  nearInvalidation?: any[];
}

const SHELVES: { key: keyof Discovery; setup: string; type: string; category: Exclude<Category, 'ALL'> }[] = [
  { key: 'mispricedCalls', setup: 'Call Wall Break', type: 'Breakout', category: 'BREAKOUTS' },
  { key: 'mostImproved', setup: 'Momentum Build', type: 'Gamma Play', category: 'GAMMA PLAYS' },
  { key: 'mispricedPuts', setup: 'Put Wall Defense', type: 'Reversal', category: 'REVERSALS' },
  { key: 'nearInvalidation', setup: 'Downside Flip', type: 'Reversal', category: 'REVERSALS' },
];

function statusOf(health: number): { label: string; tone: Tone } {
  if (health >= 70) return { label: 'Active', tone: 'positive' };
  if (health >= 55) return { label: 'Watch', tone: 'warning' };
  return { label: 'Inactive', tone: 'neutral' };
}

export function OpportunityQueuePanel({ discovery, onOpen }: { discovery?: Discovery; onOpen: () => void }) {
  const [tab, setTab] = useState<Category>('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const allRows = useMemo<QueueRow[]>(() => {
    if (!discovery) return [];
    const rows: QueueRow[] = [];
    for (const shelf of SHELVES) {
      const list = discovery[shelf.key];
      if (!Array.isArray(list)) continue;
      list.forEach((it: any, i: number) => {
        const health = Math.round(it?.health ?? 0);
        const st = statusOf(health);
        const price = isFinite(it?.marketPrice) ? it.marketPrice : null;
        const model = isFinite(it?.modelValue) ? it.modelValue : null;
        const risk = price != null && model != null && price > 0 ? (model / price - 1) * 100 : null;
        rows.push({
          key: `${shelf.key}-${i}`,
          ticker: it?.asset?.ticker ?? '—',
          setup: shelf.setup,
          type: shelf.type,
          category: shelf.category,
          level: isFinite(it?.strike) ? it.strike : null,
          price,
          conf: health,
          risk,
          status: st.label,
          statusTone: st.tone,
        });
      });
    }
    return rows.sort((a, b) => b.conf - a.conf);
  }, [discovery]);

  const rows = useMemo(() => (tab === 'ALL' ? allRows : allRows.filter((r) => r.category === tab)), [allRows, tab]);

  return (
    <TerminalPanel
      title="Opportunity Queue"
      className="min-w-0"
      padded={false}
      contentClassName="flex flex-col"
      actions={<DataClassificationLabel kind="MODELED" />}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FooterLink label="View full opportunity queue" onClick={onOpen} />
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            aria-pressed={autoRefresh}
            className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-none"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: autoRefresh ? 'var(--positive-ink)' : 'var(--text-tertiary)' }}
            />
            Auto-refresh
          </button>
        </div>
      }
    >
      {/* category tabs */}
      <div className="slayer-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--border-subtle)] px-1.5 py-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`whitespace-nowrap rounded-[var(--radius-control)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] transition-colors focus-visible:outline-none ${
              tab === t ? 'bg-[var(--surface-2)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 py-8 text-center">
          <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
            {tab === 'EARNINGS' ? 'No earnings-driven setups in the current scan.' : 'No opportunities in the current scan.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <Th>Ticker</Th>
                <Th>Setup</Th>
                <Th>Type</Th>
                <Th align="right">Level</Th>
                <Th align="right">Price</Th>
                <Th align="right">Conf.</Th>
                <Th align="right">Risk</Th>
                <Th>Status</Th>
                <Th align="right">Time</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[rgba(196,203,215,0.04)]">
                  <td className="px-2 py-1.5 text-[10.5px] font-bold text-[var(--text-primary)] slayer-num">{r.ticker}</td>
                  <td className="px-2 py-1.5 text-[10px] text-[var(--text-secondary)]">{r.setup}</td>
                  <td className="px-2 py-1.5 text-[9.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">{r.type}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] slayer-num text-[var(--text-secondary)]">{fmtLevel(r.level)}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] slayer-num text-[var(--text-secondary)]">{r.price != null ? fmtPrice2(r.price) : '—'}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] slayer-num text-[var(--text-primary)]">{r.conf}%</td>
                  <td className={`px-2 py-1.5 text-right text-[10px] slayer-num ${toneText[signTone(r.risk)]}`}>{r.risk != null ? fmtPct(r.risk) : '—'}</td>
                  <td className="px-2 py-1.5"><Badge label={r.status} tone={r.statusTone} /></td>
                  <td className="px-2 py-1.5 text-right text-[9.5px] slayer-num text-[var(--text-faint)]">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TerminalPanel>
  );
}

export default OpportunityQueuePanel;
