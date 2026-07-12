import React, { useState, useMemo } from 'react';
import {
  Users,
  BookOpen,
  FileText,
  HelpCircle,
  Calendar,
  MessageSquarePlus,
  CheckCircle,
  Compass,
  GraduationCap,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  ChevronUp,
} from 'lucide-react';
import { useContractStore } from '../lib/store';
import { V8TradeRecord } from '../types';
import { FieldError, zodError } from './ui/Field';
import { supportRequestSchema } from '../lib/formSchemas';
import { SectionHeader } from './ui/SectionHeader';

/* Research Desk — magazine/feed composition: persistent command bar (identity +
 * market clock + promoted accent action), slim channel rail at left, and a
 * lead-card + two-column feed body per channel. GLACIER tokens throughout:
 * panels var(--surface)/1px var(--border)/radius 8, controls radius 5. */

type ChannelKey = 'verified' | 'research' | 'education' | 'support';

const CHANNELS: { key: ChannelKey; label: string; sub: string; Icon: typeof FileText }[] = [
  { key: 'verified', label: 'Trade Record', sub: 'Logged trade ledger', Icon: ShieldCheck },
  { key: 'research', label: 'Research Library', sub: 'Flow & macro methodology', Icon: FileText },
  { key: 'education', label: 'Options Education', sub: 'Greeks & risk framework', Icon: BookOpen },
  { key: 'support', label: 'Product Support', sub: 'Feature requests & feedback', Icon: HelpCircle },
];

const WIN_OUTCOMES = ['Target 1 Winner', 'Target 2 Winner', 'Target 3 Winner', 'Stretch Winner'];

export default function ResearchDesk() {
  const [activeChannel, setActiveChannel] = useState<ChannelKey>('verified');

  // Real platform data — trade ledger and market clock come straight from the store.
  const trades = useContractStore((s) => s.trades);
  const serverState = useContractStore((s) => s.serverState);
  const marketState = useContractStore((s) => s.marketState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);

  // Feature requests are genuine client-side UI (a working form + voting). The
  // rows seeded below are illustrative EXAMPLES of the format, not a live
  // community board — they are flagged `example` and labeled as such in the UI
  // so the vote counts/statuses are never presented as real activity. Requests
  // a user submits this session are real and unflagged.
  const [userRequests, setUserRequests] = useState([
    { id: 'req-1', title: 'Imbalance sweep trigger audio alerts', type: 'Feature Request', votes: 24, status: 'Completed', example: true },
    { id: 'req-2', title: 'Vanna exposure speed indicators', type: 'Research Suggestion', votes: 11, status: 'In Review', example: true },
    { id: 'req-3', title: 'Gamma flip level overlays on index charts', type: 'Feature Request', votes: 19, status: 'Scheduled', example: true },
  ]);
  const [newRequestTitle, setNewRequestTitle] = useState('');
  const [newRequestType, setNewRequestType] = useState('Feature Request');
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  // Track which rows this session has already upvoted so a single click counts once.
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  const handleAddRequest = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate instead of silently returning on junk/empty input.
    const err = zodError(supportRequestSchema, { title: newRequestTitle, type: newRequestType });
    setRequestError(err);
    if (err) return;
    setUserRequests([
      { id: `req-${Date.now()}`, title: newRequestTitle.trim(), type: newRequestType, votes: 1, status: 'Open', example: false },
      ...userRequests,
    ]);
    setNewRequestTitle('');
    setRequestSubmitted(true);
    setTimeout(() => setRequestSubmitted(false), 3000);
  };

  const handleVote = (id: string) => {
    // One vote per row per session — ignore repeat clicks on an already-voted row.
    if (votedIds.has(id)) return;
    setUserRequests((prev) => prev.map((r) => (r.id === id ? { ...r, votes: r.votes + 1 } : r)));
    setVotedIds((prev) => new Set(prev).add(id));
  };

  // Aggregate stats from the real logged trade archive (empty until trades log).
  const ledgerStats = useMemo(() => {
    const list = (trades || []) as V8TradeRecord[];
    const closed = list.filter((t) => t.finalOutcome && t.finalOutcome !== 'Active');
    const wins = closed.filter((t) => WIN_OUTCOMES.includes(t.finalOutcome));
    const active = list.filter((t) => t.finalOutcome === 'Active');
    const winRate = closed.length ? (wins.length / closed.length) * 100 : null;
    const avgGain = closed.length
      ? closed.reduce((s, t) => s + (Number.isFinite(t.maxGain) ? t.maxGain : 0), 0) / closed.length
      : null;
    return {
      total: list.length,
      closed: closed.length,
      wins: wins.length,
      active: active.length,
      winRate,
      avgGain,
    };
  }, [trades]);

  const recentTrades = useMemo(
    () => ((trades || []) as V8TradeRecord[]).slice(0, 8),
    [trades],
  );

  // Trade-ledger provenance. Reuses the app-wide data_source convention (synthetic
  // sandbox feed = model-derived, any real vendor feed = live). null when absent.
  const ledgerSource =
    serverState?.data_source && serverState.data_source !== 'undefined'
      ? serverState.data_source
      : null;

  // Static, clearly-labeled reference content. No fabricated "live" statistics,
  // dates, or hit rates — these describe how the platform's tools work.
  const researchTopics = [
    {
      title: 'Reading Dealer Gamma Through Volatility',
      tag: 'Dealer Flow',
      body: 'How market makers hedge across positive and negative gamma regimes, and why price behaves differently on each side of the gamma flip.',
    },
    {
      title: 'Order Blocks, VWAP & Structure Breaks',
      tag: 'Price Structure',
      body: 'Mapping displacement zones and structure breaks (BOS) as reference levels for short-dated option premium.',
    },
    {
      title: 'Call / Put Walls & Vanna Levels',
      tag: 'Positioning',
      body: 'Interpreting call-wall and put-wall clustering on index names, and what compressing exposure implies for the expected move.',
    },
  ];

  const educationModules = [
    {
      title: 'Greeks & Dealer Hedging',
      level: 'Foundations',
      desc: 'How GEX, DEX and VEX drive market-maker hedging and where dealers are positioned to push price.',
      Icon: GraduationCap,
    },
    {
      title: 'Key Price Levels',
      level: 'Foundations',
      desc: 'Identifying major order blocks and displacement zones, and why structure breaks act as magnets for premium.',
      Icon: BookOpen,
    },
    {
      title: 'Risk Management',
      level: 'Advanced',
      desc: 'A practical framework for expected value, probability-based sizing and drawdown limits across volatility regimes.',
      Icon: Compass,
    },
  ];

  const fmtPct = (v: number | null, signed = false) =>
    v == null || !Number.isFinite(v) ? '—' : `${signed && v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  const fmtTime = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—'; // unparseable timestamp — show an em dash, not a blank
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const winTone =
    ledgerStats.winRate == null
      ? 'var(--text-primary)'
      : ledgerStats.winRate >= 50
      ? 'var(--success)'
      : 'var(--danger)';

  const featuredTopic = researchTopics[0];
  const feedTopics = researchTopics.slice(1);
  const featuredModule = educationModules[0];
  const feedModules = educationModules.slice(1);
  const FeaturedModuleIcon = featuredModule.Icon;

  return (
    <div className="w-full min-w-0 flex flex-col font-mono select-none antialiased gap-4 text-[var(--text-secondary)]">

      {/* ── Command bar — persistent header: identity, market clock, promoted primary action ── */}
      <header className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--accent-soft)]">
              <Users className="w-4 h-4 text-[var(--accent-color)]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-primary)] leading-tight">
                Research Desk
              </h2>
              <span className="block text-[10px] text-[var(--text-tertiary)] truncate">
                Research &amp; Education
              </span>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Market clock chip */}
            <div className="flex items-center gap-2 rounded-[5px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: marketState.open ? 'var(--success)' : 'var(--danger)' }}
                aria-hidden="true"
              />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: marketState.open ? 'var(--success)' : 'var(--danger)' }}
              >
                {marketState.open ? 'Market Open' : 'Market Closed'}
              </span>
              <span className="text-[10px] tabular-nums text-[var(--text-tertiary)] whitespace-nowrap">
                {marketState.open ? `closes ${marketState.closeIn}` : `opens ${marketState.openIn}`}
              </span>
            </div>

            {/* Tracked contract chip */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-[5px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Tracking</span>
              <span className="text-[10px] font-bold tabular-nums text-[var(--text-primary)]">
                {selectedAsset?.ticker ?? '—'}
              </span>
            </div>

            {/* Promoted compose action — accent primary */}
            <button
              onClick={() => setActiveChannel('support')}
              className="flex items-center gap-1.5 rounded-[5px] bg-[var(--accent-color)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary-contrast)] shadow-[0_6px_20px_-8px_var(--accent-glow)] hover:bg-[var(--accent-strong)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
              New Request
            </button>
          </div>
        </div>

        {/* Positioning line — folded into the command bar as a quiet second row */}
        <p className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
          The research desk behind Slayer Terminal — a logged trade ledger, methodology notes and
          options education. A software platform,{' '}
          <span className="text-[var(--text-primary)]">not a signal room</span>: results stay
          accountable because they are recorded, not alerted.
        </p>
      </header>

      {/* ── Body — slim channel rail at left, magazine feed at right ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[192px_minmax(0,1fr)] gap-4 items-start min-w-0">

        {/* Channel rail — horizontal strip on mobile, slim vertical rail on desktop */}
        <div className="flex flex-col gap-3 min-w-0">
          <nav
            aria-label="Desk channels"
            className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0"
          >
            {CHANNELS.map(({ key, label, sub, Icon }) => {
              const active = activeChannel === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveChannel(key)}
                  aria-pressed={active}
                  className={`flex items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-left shrink-0 lg:shrink lg:w-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] ${
                    active
                      ? 'bg-[var(--accent-soft)]'
                      : 'hover:bg-[var(--surface)]'
                  }`}
                >
                  <Icon
                    className="w-4 h-4 shrink-0"
                    style={{ color: active ? 'var(--accent-color)' : 'var(--text-tertiary)' }}
                    aria-hidden="true"
                  />
                  <span className="flex flex-col min-w-0">
                    <span
                      className="text-[11px] font-semibold whitespace-nowrap lg:whitespace-normal"
                      style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                      {label}
                    </span>
                    <span className="hidden lg:block text-[9px] text-[var(--text-tertiary)] truncate">{sub}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Live sessions note — rail footer */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                Live Sessions
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Walkthroughs and education sessions are announced in-app. Tracked contract:{' '}
              <span className="font-semibold text-[var(--text-primary)] tabular-nums">{selectedAsset?.ticker ?? '—'}</span>.
            </p>
          </div>
        </div>

        {/* Feed column */}
        <main className="min-w-0 flex flex-col gap-4">

          {/* Trade Record — wide ledger lead card + two-column entry feed */}
          {activeChannel === 'verified' && (
            <section className="flex flex-col gap-4 animate-fadeIn min-w-0">
              <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-[var(--accent-color)]" aria-hidden="true" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)] truncate">
                      Trade Ledger
                    </span>
                  </div>
                  {ledgerSource && (
                    <span className="rounded-[5px] border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] whitespace-nowrap">
                      feed · {ledgerSource}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] items-center gap-x-8 gap-y-4 p-4 sm:p-5">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                      Win Rate
                    </div>
                    <div className="mt-1 text-[34px] leading-none font-bold tabular-nums" style={{ color: winTone }}>
                      {fmtPct(ledgerStats.winRate)}
                    </div>
                    <div className="mt-1.5 text-[11px] tabular-nums text-[var(--text-tertiary)]">
                      {ledgerStats.wins}/{ledgerStats.closed} closed
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 min-w-0">
                    <div className="rounded-[5px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 min-w-0">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Logged</div>
                      <div className="mt-1 text-base font-semibold tabular-nums text-[var(--text-primary)]">{ledgerStats.total}</div>
                    </div>
                    <div className="rounded-[5px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 min-w-0">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Avg Gain</div>
                      <div
                        className="mt-1 text-base font-semibold tabular-nums"
                        style={{ color: ledgerStats.avgGain == null ? 'var(--text-primary)' : ledgerStats.avgGain >= 0 ? 'var(--success)' : 'var(--danger)' }}
                      >
                        {fmtPct(ledgerStats.avgGain, true)}
                      </div>
                    </div>
                    <div className="rounded-[5px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 min-w-0">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Active</div>
                      <div
                        className="mt-1 text-base font-semibold tabular-nums"
                        style={{ color: ledgerStats.active > 0 ? 'var(--warning)' : 'var(--text-primary)' }}
                      >
                        {ledgerStats.active}
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              {recentTrades.length > 0 ? (
                <div className="flex flex-col gap-2 min-w-0">
                  <SectionHeader
                    label="Recent entries"
                    right={<span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{recentTrades.length}</span>}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {recentTrades.map((t) => {
                      const bullish = t.direction === 'BULLISH';
                      const isWin = WIN_OUTCOMES.includes(t.finalOutcome);
                      const isActive = t.finalOutcome === 'Active';
                      const dirTone = bullish ? 'var(--success)' : 'var(--danger)';
                      const outcomeTone = isActive ? 'var(--warning)' : isWin ? 'var(--success)' : 'var(--danger)';
                      return (
                        <article
                          key={t.id}
                          className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--border-strong)] transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-[var(--text-primary)] truncate min-w-0">
                              {t.contract}
                            </span>
                            <span
                              className="text-[9px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[5px] whitespace-nowrap shrink-0"
                              style={{ color: outcomeTone, background: `color-mix(in srgb, ${outcomeTone} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${outcomeTone} 33%, transparent)` }}
                            >
                              {t.finalOutcome}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)] tabular-nums min-w-0">
                            {bullish ? (
                              <TrendingUp className="w-3 h-3 shrink-0" style={{ color: dirTone }} aria-hidden="true" />
                            ) : (
                              <TrendingDown className="w-3 h-3 shrink-0" style={{ color: dirTone }} aria-hidden="true" />
                            )}
                            <span className="truncate">
                              {fmtTime(t.closeTs || t.timestamp) || '—'}
                              {t.recommendation && (t.recommendation as string) !== 'undefined' ? ` · ${t.recommendation}` : ''}
                            </span>
                          </div>
                          <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
                            <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Max gain</span>
                            <span
                              className="text-sm font-bold tabular-nums"
                              style={{ color: (t.maxGain ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}
                            >
                              {fmtPct(t.maxGain, true)}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                  <p className="text-xs text-[var(--text-secondary)]">
                    {ledgerStats.total === 0
                      ? 'No trades recorded — waiting on feed.'
                      : `No closed trades — ${ledgerStats.active} open ${ledgerStats.active === 1 ? 'position' : 'positions'} pending.`}
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-1 leading-relaxed">
                    {ledgerStats.total === 0
                      ? 'The live track record starts at launch — logged trades appear here as the engine records them.'
                      : 'Closed results appear here once open positions resolve.'}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Research Library — featured lead note + two-column feed */}
          {activeChannel === 'research' && (
            <section className="flex flex-col gap-4 animate-fadeIn min-w-0">
              <SectionHeader
                icon={<FileText className="w-4 h-4 text-[var(--text-tertiary)]" />}
                label="Research Library"
                right={<span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Methodology</span>}
              />
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed -mt-2">
                Reference notes on how the platform reads flow, structure and positioning — method, not trade calls.
              </p>

              {/* Featured note — wide lead card */}
              <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--accent-color)]">
                  {featuredTopic.tag}
                </span>
                <h3 className="mt-1.5 text-base sm:text-lg font-bold text-[var(--text-primary)] tracking-tight leading-snug">
                  {featuredTopic.title}
                </h3>
                <p className="mt-2 max-w-2xl text-xs text-[var(--text-secondary)] leading-relaxed">
                  {featuredTopic.body}
                </p>
              </article>

              {/* Remaining notes — two-column feed */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {feedTopics.map((a) => (
                  <article
                    key={a.title}
                    className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--border-strong)] transition-colors"
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                      {a.tag}
                    </span>
                    <h4 className="mt-1 text-[13px] font-semibold text-[var(--text-primary)] tracking-tight leading-snug">
                      {a.title}
                    </h4>
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">{a.body}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Options Education — featured module + two-column curriculum feed */}
          {activeChannel === 'education' && (
            <section className="flex flex-col gap-4 animate-fadeIn min-w-0">
              <SectionHeader
                icon={<GraduationCap className="w-4 h-4 text-[var(--text-tertiary)]" />}
                label="Options Education"
                right={<span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Core curriculum</span>}
              />

              {/* Featured module — wide lead card */}
              <article className="flex items-start gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--accent-soft)]">
                  <FeaturedModuleIcon className="w-4 h-4 text-[var(--accent-color)]" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--accent-color)]">
                    {featuredModule.level}
                  </span>
                  <h3 className="mt-1 text-base sm:text-lg font-bold text-[var(--text-primary)] tracking-tight leading-snug">
                    {featuredModule.title}
                  </h3>
                  <p className="mt-1.5 max-w-2xl text-xs text-[var(--text-secondary)] leading-relaxed">
                    {featuredModule.desc}
                  </p>
                </div>
              </article>

              {/* Remaining modules — two-column feed */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {feedModules.map((m) => {
                  const Icon = m.Icon;
                  return (
                    <article
                      key={m.title}
                      className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--border-strong)] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Icon className="w-4 h-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
                        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)] whitespace-nowrap">
                          {m.level}
                        </span>
                      </div>
                      <h4 className="mt-2 text-[13px] font-semibold text-[var(--text-primary)] tracking-tight leading-snug">
                        {m.title}
                      </h4>
                      <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">{m.desc}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* Product Support — wide composer lead card + two-column request feed */}
          {activeChannel === 'support' && (
            <section className="flex flex-col gap-4 animate-fadeIn min-w-0">
              <SectionHeader
                icon={<HelpCircle className="w-4 h-4 text-[var(--text-tertiary)]" />}
                label="Support & Feature Requests"
                right={<span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Product roadmap</span>}
              />

              {/* Composer — wide lead card */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MessageSquarePlus className="w-4 h-4 text-[var(--accent-color)]" aria-hidden="true" />
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                    Submit a Request
                  </h4>
                </div>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed mb-3">
                  Feature ideas or bug reports. Upvote open requests to prioritize what ships next.
                </p>

                {requestSubmitted ? (
                  <div className="rounded-[5px] border border-[var(--success)]/40 bg-[var(--success)]/10 p-3 flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} aria-hidden="true" />
                    <div>
                      <span className="text-xs font-semibold text-[var(--text-primary)] block">
                        Request submitted
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        Logged and queued for review.
                      </span>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleAddRequest} className="flex flex-col gap-2">
                    <div className="flex flex-col md:flex-row gap-2 min-w-0">
                      <input
                        type="text"
                        value={newRequestTitle}
                        onChange={(e) => { setNewRequestTitle(e.target.value); if (requestError) setRequestError(null); }}
                        aria-invalid={!!requestError}
                        aria-label="Request title"
                        maxLength={120}
                        placeholder="e.g. Alert when IV drops below 15%"
                        className={`flex-1 min-w-0 rounded-[5px] border bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] ${requestError ? 'border-[var(--danger)]/60' : 'border-[var(--border)] focus:border-[var(--border-strong)]'}`}
                      />
                      <select
                        value={newRequestType}
                        onChange={(e) => setNewRequestType(e.target.value)}
                        aria-label="Category"
                        className="md:w-48 shrink-0 rounded-[5px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--border-strong)]"
                      >
                        <option value="Feature Request">Feature Request</option>
                        <option value="Technical Bug">Technical Bug</option>
                        <option value="Research Suggestion">Research Suggestion</option>
                      </select>
                      <button
                        type="submit"
                        className="shrink-0 rounded-[5px] bg-[var(--accent-color)] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary-contrast)] shadow-[0_6px_20px_-8px_var(--accent-glow)] hover:bg-[var(--accent-strong)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                      >
                        Submit Request
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <FieldError>{requestError}</FieldError>
                      <span className="text-[9px] tabular-nums text-[var(--text-tertiary)] ml-auto shrink-0">
                        {newRequestTitle.length}/120
                      </span>
                    </div>
                  </form>
                )}
              </div>

              {/* Open requests — two-column feed with compact meta rows */}
              <div className="flex flex-col gap-2 min-w-0">
                <SectionHeader
                  label="Open Requests"
                  right={<span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{userRequests.length}</span>}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {userRequests.map((req) => {
                    const tone =
                      req.status === 'Completed'
                        ? 'var(--success)'
                        : req.status === 'In Review'
                        ? 'var(--warning)'
                        : req.status === 'Scheduled'
                        ? 'var(--info)'
                        : 'var(--text-tertiary)';
                    const voted = votedIds.has(req.id);
                    return (
                      <article
                        key={req.id}
                        className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col gap-2 hover:border-[var(--border-strong)] transition-colors"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                            {req.type}
                          </span>
                          <span className="text-[var(--text-tertiary)]" aria-hidden="true">·</span>
                          <span
                            className="text-[8px] font-semibold uppercase tracking-[0.12em]"
                            style={{ color: tone }}
                          >
                            {req.status}
                          </span>
                          {req.example && (
                            <span className="ml-auto rounded-[5px] border border-[var(--border)] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                              Example
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3 min-w-0">
                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate min-w-0 flex-1 leading-tight">
                            {req.title}
                          </span>
                          <button
                            onClick={() => handleVote(req.id)}
                            disabled={voted}
                            aria-pressed={voted}
                            aria-label={
                              voted
                                ? `Voted for "${req.title}" — ${req.votes} ${req.votes === 1 ? 'vote' : 'votes'}`
                                : `Upvote "${req.title}" — ${req.votes} ${req.votes === 1 ? 'vote' : 'votes'}`
                            }
                            className={`flex items-center gap-1 rounded-[5px] border px-2 py-1 shrink-0 transition-colors focus-visible:ring-1 focus-visible:ring-[var(--ring)] focus:outline-none ${
                              voted
                                ? 'border-[var(--success)]/60 bg-[var(--success)]/10 cursor-default'
                                : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]'
                            }`}
                          >
                            <ChevronUp
                              className="w-3.5 h-3.5"
                              aria-hidden="true"
                              style={{ color: voted ? 'var(--success)' : 'var(--text-tertiary)', fill: voted ? 'var(--success)' : 'none' }}
                            />
                            <span className="text-[11px] font-semibold tabular-nums text-[var(--text-primary)]">
                              {req.votes}
                            </span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

        </main>
      </div>
    </div>
  );
}
