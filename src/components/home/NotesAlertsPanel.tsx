/**
 * NotesAlertsPanel — a timestamped event feed synthesized from the live state, plus
 * user notes persisted to localStorage. The feed accumulates: when the market read
 * genuinely changes (price crossing the pin, net-gamma trend flipping, a wall
 * capping price) a new line is prepended with the REAL time it was observed, so the
 * timestamps are honest rather than fabricated. Notes the trader adds persist across
 * sessions.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { FooterLink } from './ui';
import { fmtLevel, nyClock, toneVar, type Tone } from './format';

interface EventModel {
  spot?: number;
  magnet?: number;
  callWall?: number;
  putWall?: number;
  netGex?: number;
  netGexTrend: string;
}

interface FeedItem {
  id: string;
  ts: number;
  time: string;
  text: string;
  tone: Tone;
  isNote?: boolean;
}

const NOTES_KEY = 'slayer.dashboardNotes.v1';

function loadNotes(): FeedItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function NotesAlertsPanel({ model, onOpen }: { model: EventModel; onOpen: () => void }) {
  const [events, setEvents] = useState<FeedItem[]>([]);
  const [notes, setNotes] = useState<FeedItem[]>(() => loadNotes());
  const [draft, setDraft] = useState('');
  const prevSignal = useRef<string | null>(null);

  // Current synthesized reads (the raw material for the event feed).
  const reads = useMemo<{ text: string; tone: Tone }[]>(() => {
    const { spot, magnet, callWall, netGex, netGexTrend } = model;
    const out: { text: string; tone: Tone }[] = [];
    if (spot != null && magnet != null) {
      const above = spot > magnet;
      out.push({
        text: `${'SPX'} ${above ? 'holding above' : 'sitting below'} pin ${fmtLevel(magnet)} — ${above ? 'bullish while above' : 'pressured below'}.`,
        tone: above ? 'positive' : 'negative',
      });
    }
    if (callWall != null) out.push({ text: `Call wall ${fmtLevel(callWall)} capping upside advance.`, tone: 'call' });
    if (netGex != null) {
      const neg = netGex < 0;
      out.push({
        text: `Net GEX ${neg ? 'negative' : 'positive'} and ${netGexTrend.toLowerCase()}. ${neg ? 'Watch for dealer hedging.' : 'Range compression favored.'}`,
        tone: neg ? 'negative' : 'positive',
      });
    }
    return out;
  }, [model]);

  const signal = reads.map((r) => r.text).join('|');

  useEffect(() => {
    if (prevSignal.current === signal) return;
    prevSignal.current = signal;
    if (reads.length === 0) return;
    const now = nyClock();
    const nowTs = Date.now();
    setEvents((prev) => {
      const existing = new Set(prev.map((e) => e.text));
      const fresh: FeedItem[] = reads
        .filter((r) => !existing.has(r.text))
        .map((r, i) => ({ id: `ev-${nowTs}-${i}`, ts: nowTs + i, time: now, text: r.text, tone: r.tone }));
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev].slice(0, 12);
    });
  }, [signal, reads]);

  const feed = useMemo(
    () => [...notes, ...events].sort((a, b) => b.ts - a.ts).slice(0, 12),
    [notes, events],
  );

  const addNote = () => {
    const text = draft.trim();
    if (!text) return;
    const note: FeedItem = { id: `note-${Date.now()}`, ts: Date.now(), time: nyClock(), text, tone: 'neutral', isNote: true };
    const next = [note, ...notes].slice(0, 50);
    setNotes(next);
    setDraft('');
    try {
      window.localStorage?.setItem(NOTES_KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode — the in-memory list still works this session */
    }
  };

  return (
    <TerminalPanel
      title="Notes & Alerts"
      className="min-w-0"
      padded={false}
      contentClassName="flex min-h-0 flex-col"
      actions={<FooterLink label="View all" onClick={onOpen} />}
    >
      {/* event feed */}
      <div className="slayer-scrollbar max-h-[220px] min-h-0 flex-1 overflow-y-auto">
        {feed.length === 0 ? (
          <div className="px-3 py-8 text-center text-[10px] text-[var(--text-muted)]">
            No events yet — synthesized reads and notes appear here.
          </div>
        ) : (
          <ul>
            {feed.map((it) => (
              <li key={it.id} className="flex items-start gap-2 border-b border-[var(--border-subtle)] px-2.5 py-1.5 last:border-0">
                <span className="mt-px w-9 shrink-0 text-[8.5px] slayer-num text-[var(--text-tertiary)]">{it.time}</span>
                <span aria-hidden="true" className="mt-[5px] h-1 w-1 shrink-0 rounded-full" style={{ background: toneVar[it.tone] }} />
                <span className="min-w-0 text-[10px] leading-snug text-[var(--text-secondary)]">
                  {it.isNote ? <span className="mr-1 text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">Note</span> : null}
                  {it.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* add note */}
      <div className="flex shrink-0 items-center gap-1.5 border-t border-[var(--border-subtle)] p-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addNote();
            }
          }}
          placeholder="Add note…"
          className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] px-2 py-1 text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--border-mid)] focus:outline-none"
        />
        <button
          type="button"
          onClick={addNote}
          aria-label="Add note"
          className="flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-1 text-[var(--text-secondary)] transition-colors hover:border-[var(--border-mid)] hover:text-[var(--text-primary)] focus-visible:outline-none"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </TerminalPanel>
  );
}

export default NotesAlertsPanel;
