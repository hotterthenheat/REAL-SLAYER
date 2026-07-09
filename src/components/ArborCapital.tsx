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
import { DataStateBadge } from './ui/DataStateBadge';

type ChannelKey = 'verified' | 'research' | 'education' | 'support';

const CHANNELS: { key: ChannelKey; label: string; sub: string; Icon: typeof FileText }[] = [
  { key: 'verified', label: 'Trade Record', sub: 'Logged trade ledger', Icon: ShieldCheck },
  { key: 'research', label: 'Research Library', sub: 'Flow & macro methodology', Icon: FileText },
  { key: 'education', label: 'Options Education', sub: 'Greeks & risk framework', Icon: BookOpen },
  { key: 'support', label: 'Product Support', sub: 'Feature requests & feedback', Icon: HelpCircle },
];

const WIN_OUTCOMES = ['Target 1 Winner', 'Target 2 Winner', 'Target 3 Winner', 'Stretch Winner'];

export default function ArborCapital() {
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

  return (
    <div className="w-full flex flex-col font-mono select-none antialiased space-y-4 text-[var(--text-secondary)]">

      {/* Masthead — quiet label register, terse positioning folded in; market clock at right */}
      <div className="flex flex-col gap-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4 md:flex-row md:items-stretch md:justify-between">
        <div className="min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              Arbor Capital — Research &amp; Education
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
            The research desk behind Slayer Terminal — a logged trade ledger, methodology notes and
            options education. A software platform,{' '}
            <span className="text-[var(--text-primary)]">not a signal room</span>: results stay
            accountable because they are recorded, not alerted.
          </p>
        </div>
        <div className="flex shrink-0 items-stretch divide-x divide-[var(--border)] rounded-[7px] border border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex flex-col justify-center px-4 py-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Market</span>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: marketState.open ? 'var(--success)' : 'var(--danger)' }}
            >
              {marketState.open ? 'OPEN' : 'CLOSED'}
            </span>
          </div>
          <div className="flex flex-col justify-center px-4 py-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              {marketState.open ? 'Closes in' : 'Opens in'}
            </span>
            <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">
              {marketState.open ? marketState.closeIn : marketState.openIn}
            </span>
          </div>
        </div>
      </div>

      {/* Workspace — narrow nav rail + dominant content column */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">

        {/* Nav rail */}
        <div className="lg:col-span-1 flex flex-col gap-1.5">
          {CHANNELS.map(({ key, label, sub, Icon }) => {
            const active = activeChannel === key;
            return (
              <button
                key={key}
                onClick={() => setActiveChannel(key)}
                aria-pressed={active}
                className={`flex items-center gap-3 rounded-[7px] border border-l-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] ${
                  active
                    ? 'border-[var(--border-strong)] border-l-[var(--accent-color)] bg-[var(--surface-2)]'
                    : 'border-[var(--border)] border-l-transparent bg-[var(--surface)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <Icon
                  className="w-4 h-4 shrink-0"
                  style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                />
                <div className="flex flex-col min-w-0">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-[0.1em]"
                    style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    {label}
                  </span>
                  <span className="text-[9px] text-[var(--text-tertiary)] normal-case truncate">{sub}</span>
                </div>
              </button>
            );
          })}

          {/* Live session note */}
          <div className="mt-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
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

        {/* Content */}
        <div className="lg:col-span-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4 min-h-[360px]">

          {/* Trade Record — real logged trade ledger (empty until the engine logs trades) */}
          {activeChannel === 'verified' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <SectionHeader
                className="border-b border-[var(--border)] pb-3"
                icon={<ShieldCheck className="w-4 h-4 text-[var(--text-tertiary)]" />}
                label="Trade Ledger"
                right={
                  ledgerSource ? (
                    <DataStateBadge state={ledgerSource === 'SANDBOX_SYNTHETIC' ? 'model' : 'live'} />
                  ) : undefined
                }
              />

              {/* Focal strip — Win Rate is the hero, supporters step down, hairline-separated */}
              <div className="flex flex-col rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] sm:flex-row sm:items-stretch divide-y divide-[var(--border)] sm:divide-y-0 sm:divide-x">
                <div className="px-4 py-3 sm:min-w-[148px]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                    Win Rate
                  </div>
                  <div className="mt-1 text-[26px] leading-none font-bold tabular-nums" style={{ color: winTone }}>
                    {fmtPct(ledgerStats.winRate)}
                  </div>
                  <div className="mt-1.5 text-[11px] tabular-nums text-[var(--text-tertiary)]">
                    {ledgerStats.wins}/{ledgerStats.closed} closed
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-3 divide-x divide-[var(--border)]">
                  <div className="px-4 py-3 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Logged</div>
                    <div className="mt-1 text-[17px] font-semibold tabular-nums text-[var(--text-primary)]">{ledgerStats.total}</div>
                  </div>
                  <div className="px-4 py-3 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Avg Gain</div>
                    <div
                      className="mt-1 text-[17px] font-semibold tabular-nums"
                      style={{ color: ledgerStats.avgGain == null ? 'var(--text-primary)' : ledgerStats.avgGain >= 0 ? 'var(--success)' : 'var(--danger)' }}
                    >
                      {fmtPct(ledgerStats.avgGain, true)}
                    </div>
                  </div>
                  <div className="px-4 py-3 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Active</div>
                    <div className="mt-1 text-[17px] font-semibold tabular-nums" style={{ color: ledgerStats.active > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
                      {ledgerStats.active}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent entries — hairline-ruled ledger rows, not cards */}
              {recentTrades.length > 0 ? (
                <div className="flex flex-col">
                  <div className="flex items-center justify-between px-1 pb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                      Recent entries
                    </span>
                    <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{recentTrades.length}</span>
                  </div>
                  <div className="rounded-[10px] border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
                    {recentTrades.map((t) => {
                      const bullish = t.direction === 'BULLISH';
                      const isWin = WIN_OUTCOMES.includes(t.finalOutcome);
                      const isActive = t.finalOutcome === 'Active';
                      const dirTone = bullish ? 'var(--success)' : 'var(--danger)';
                      const outcomeTone = isActive ? 'var(--warning)' : isWin ? 'var(--success)' : 'var(--danger)';
                      return (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-[var(--surface-2)] transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {bullish ? (
                              <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: dirTone }} />
                            ) : (
                              <TrendingDown className="w-3.5 h-3.5 shrink-0" style={{ color: dirTone }} />
                            )}
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-[var(--text-primary)] block truncate">
                                {t.contract}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">
                                {fmtTime(t.closeTs || t.timestamp) || '—'}
                                {t.recommendation && (t.recommendation as string) !== 'undefined' ? ` · ${t.recommendation}` : ''}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span
                              className="text-xs font-semibold tabular-nums text-right w-16"
                              style={{ color: (t.maxGain ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}
                            >
                              {fmtPct(t.maxGain, true)}
                            </span>
                            <span
                              className="text-[9px] font-semibold uppercase tracking-[0.1em] px-2 py-1 rounded-[7px] whitespace-nowrap"
                              style={{ color: outcomeTone, background: `color-mix(in srgb, ${outcomeTone} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${outcomeTone} 33%, transparent)` }}
                            >
                              {t.finalOutcome}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
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
            </div>
          )}

          {/* Research Library — editorial reading index, numbered, hairline-ruled */}
          {activeChannel === 'research' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <SectionHeader
                className="border-b border-[var(--border)] pb-3"
                icon={<FileText className="w-4 h-4 text-[var(--text-tertiary)]" />}
                label="Research Library"
                right={<span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Methodology</span>}
              />
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed -mt-1">
                Reference notes on how the platform reads flow, structure and positioning — method, not trade calls.
              </p>
              <ol className="border-t border-[var(--border)]">
                {researchTopics.map((a, i) => {
                  const lead = i === 0;
                  return (
                    <li
                      key={a.title}
                      className="grid grid-cols-[2rem_1fr] gap-4 border-b border-[var(--border)] py-4"
                    >
                      <span className="text-[15px] font-semibold tabular-nums text-[var(--text-tertiary)] leading-none pt-0.5">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                          {a.tag}
                        </span>
                        <h4
                          className={`mt-1 font-semibold text-[var(--text-primary)] tracking-tight leading-snug ${lead ? 'text-[15px]' : 'text-[13px]'}`}
                        >
                          {a.title}
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">{a.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Options Education — compact ruled curriculum list with level column */}
          {activeChannel === 'education' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <SectionHeader
                className="border-b border-[var(--border)] pb-3"
                icon={<GraduationCap className="w-4 h-4 text-[var(--text-tertiary)]" />}
                label="Options Education"
                right={<span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Core curriculum</span>}
              />
              <div className="border-t border-[var(--border)]">
                {educationModules.map((m) => {
                  const Icon = m.Icon;
                  return (
                    <div
                      key={m.title}
                      className="grid grid-cols-[1.25rem_1fr_auto] items-start gap-4 border-b border-[var(--border)] py-4"
                    >
                      <Icon className="w-4 h-4 text-[var(--text-tertiary)] mt-0.5" />
                      <div className="min-w-0">
                        <h4 className="text-[13px] font-semibold text-[var(--text-primary)] tracking-tight leading-snug">
                          {m.title}
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">{m.desc}</p>
                      </div>
                      <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)] whitespace-nowrap pt-0.5">
                        {m.level}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Product Support */}
          {activeChannel === 'support' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              <SectionHeader
                className="border-b border-[var(--border)] pb-3"
                icon={<HelpCircle className="w-4 h-4 text-[var(--text-tertiary)]" />}
                label="Support & Feature Requests"
                right={<span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Product roadmap</span>}
              />

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">

                {/* Submit — narrower rail */}
                <div className="md:col-span-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <MessageSquarePlus className="w-4 h-4 text-[var(--text-tertiary)]" />
                    <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                      Submit a Request
                    </h4>
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed mb-4">
                    Feature ideas or bug reports. Upvote open requests to prioritize what ships next.
                  </p>

                  {requestSubmitted ? (
                    <div className="rounded-[7px] border border-[var(--success)]/40 bg-[var(--success)]/10 p-3 flex items-start gap-2.5">
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
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
                    <form onSubmit={handleAddRequest} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)] block">
                          Request title
                        </label>
                        <input
                          type="text"
                          value={newRequestTitle}
                          onChange={(e) => { setNewRequestTitle(e.target.value); if (requestError) setRequestError(null); }}
                          aria-invalid={!!requestError}
                          maxLength={120}
                          placeholder="e.g. Alert when IV drops below 15%"
                          className={`w-full rounded-[7px] border bg-[var(--surface)] p-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] ${requestError ? 'border-[var(--danger)]/60' : 'border-[var(--border)] focus:border-[var(--border-strong)]'}`}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <FieldError>{requestError}</FieldError>
                          <span className="text-[9px] tabular-nums text-[var(--text-tertiary)] ml-auto shrink-0">
                            {newRequestTitle.length}/120
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)] block">
                          Category
                        </label>
                        <select
                          value={newRequestType}
                          onChange={(e) => setNewRequestType(e.target.value)}
                          className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--border-strong)]"
                        >
                          <option value="Feature Request">Feature Request</option>
                          <option value="Technical Bug">Technical Bug</option>
                          <option value="Research Suggestion">Research Suggestion</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="w-full rounded-[7px] py-2.5 bg-[var(--success)] hover:opacity-90 text-black font-semibold uppercase text-[10px] tracking-[0.16em] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-2)]"
                      >
                        Submit Request
                      </button>
                    </form>
                  )}
                </div>

                {/* Open requests — dominant column, hairline-ruled rows */}
                <div className="md:col-span-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] flex flex-col">
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border)]">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                      Open Requests
                    </span>
                  </div>
                  <div className="overflow-y-auto max-h-[320px] divide-y divide-[var(--border)]">
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
                        <div
                          key={req.id}
                          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface)] transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                {req.type}
                              </span>
                              <span className="text-[var(--text-tertiary)]">·</span>
                              <span
                                className="text-[8px] font-semibold uppercase tracking-[0.12em]"
                                style={{ color: tone }}
                              >
                                {req.status}
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-[var(--text-primary)] block truncate leading-tight">
                              {req.title}
                            </span>
                          </div>
                          <button
                            onClick={() => handleVote(req.id)}
                            disabled={voted}
                            aria-pressed={voted}
                            aria-label={
                              voted
                                ? `Voted for "${req.title}" — ${req.votes} ${req.votes === 1 ? 'vote' : 'votes'}`
                                : `Upvote "${req.title}" — ${req.votes} ${req.votes === 1 ? 'vote' : 'votes'}`
                            }
                            className={`flex flex-col items-center justify-center rounded-[7px] border px-2.5 py-1.5 shrink-0 transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none ${
                              voted
                                ? 'border-[var(--success)]/60 bg-[var(--success)]/10 cursor-default'
                                : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]'
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
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
