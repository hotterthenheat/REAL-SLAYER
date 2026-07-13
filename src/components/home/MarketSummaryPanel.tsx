/**
 * MarketSummaryPanel — a compact key/value read of the current market context.
 * Only sourceable fields carry a value: gamma exposure (net GEX), put/call OI ratio,
 * net DEX/VEX, realized vol (Yang-Zhang over the streamed candles), gamma trend
 * (real frame-over-frame net-gamma trend) and the expected move. Fields the feed
 * can't provide (VIX, 25d skew) render an honest "—" rather than a fabricated value.
 */
import { useMemo } from 'react';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';
import { FooterLink } from './ui';
import { fmtBnSigned, fmtCompact, fmtPct, fmtPts, signTone, toneText, type Tone } from './format';
import { computeRealizedVol } from '../../lib/realizedVol';
import type { Candle } from '../../types';

interface SummaryModel {
  netGex?: number;
  netDex?: number;
  netVex?: number;
  emAbs?: number | null;
  emPct?: number | null;
  netGexTrend: string;
  profile: any;
  candles: Candle[];
}

interface Row {
  label: string;
  value: string;
  tone?: Tone;
  qual?: string;
  qualTone?: Tone;
}

export function MarketSummaryPanel({ model, onOpen }: { model: SummaryModel; onOpen: () => void }) {
  const rows = useMemo<Row[]>(() => {
    const { netGex, netDex, netVex, emAbs, emPct, netGexTrend, profile, candles } = model;

    // PUT / CALL open-interest ratio (put ÷ call) + qualifier.
    let pcVal = '—';
    let pcQual = '';
    let pcTone: Tone = 'neutral';
    const tc = profile?.totalCallOi;
    const tp = profile?.totalPutOi;
    if (isFinite(tp) && isFinite(tc) && tc > 0 && tp > 0) {
      const r = tp / tc;
      pcVal = r.toFixed(2);
      pcQual = r > 1.15 ? 'Put-heavy' : r < 0.85 ? 'Call-heavy' : 'Neutral';
      pcTone = r > 1.15 ? 'negative' : r < 0.85 ? 'call' : 'neutral';
    } else if (profile?.callPutOiRatio) {
      const cp = parseFloat(String(profile.callPutOiRatio));
      if (isFinite(cp) && cp > 0) {
        const r = 1 / cp;
        pcVal = r.toFixed(2);
        pcQual = r > 1.15 ? 'Put-heavy' : r < 0.85 ? 'Call-heavy' : 'Neutral';
        pcTone = r > 1.15 ? 'negative' : r < 0.85 ? 'call' : 'neutral';
      }
    }

    // Realized vol (Yang-Zhang, 10-bar) over the live candles.
    let rvVal = '—';
    if (candles && candles.length >= 5) {
      const rv = computeRealizedVol(candles, 10).primary;
      if (rv > 0) rvVal = `${(rv * 100).toFixed(2)}%`;
    }

    const trendMap: Record<string, { label: string; tone: Tone }> = {
      Strengthening: { label: 'Increasing', tone: 'positive' },
      Weakening: { label: 'Decreasing', tone: 'negative' },
      Stable: { label: 'Stable', tone: 'neutral' },
    };
    const trend = trendMap[netGexTrend] ?? { label: '—', tone: 'neutral' as Tone };

    return [
      { label: 'Gamma Exposure', value: fmtBnSigned(netGex), tone: signTone(netGex) },
      { label: 'Put / Call (OI)', value: pcVal, tone: pcTone, qual: pcQual, qualTone: pcTone },
      { label: 'Net DEX', value: fmtCompact(netDex, true), tone: signTone(netDex) },
      { label: 'Net VEX', value: fmtCompact(netVex, true), tone: signTone(netVex) },
      { label: 'Realized Vol (10)', value: rvVal, tone: 'neutral' },
      { label: 'Gamma Trend', value: trend.label, tone: trend.tone },
      {
        label: 'Expected Move (1D)',
        value: emAbs != null ? `±${fmtPts(emAbs).replace('+', '')}` : '—',
        tone: 'warning',
        qual: emPct != null ? `±${(emPct * 100).toFixed(1)}%` : undefined,
        qualTone: 'warning',
      },
      { label: 'VIX', value: '—', tone: 'neutral' },
      { label: 'Skew (25d)', value: '—', tone: 'neutral' },
    ];
  }, [model]);

  return (
    <TerminalPanel
      title="Market Summary"
      className="min-w-0"
      padded={false}
      contentClassName="flex flex-col"
      footer={<FooterLink label="View market breadth" onClick={onOpen} />}
    >
      <div className="flex flex-col">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-2.5 py-[5px] last:border-0"
          >
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{r.label}</span>
            <span className="flex items-baseline gap-1.5">
              {r.qual ? (
                <span className={`text-[8.5px] ${r.qualTone ? toneText[r.qualTone] : 'text-[var(--text-tertiary)]'}`}>{r.qual}</span>
              ) : null}
              <span className={`slayer-num text-[10.5px] font-semibold ${toneText[r.tone ?? 'neutral']}`}>{r.value}</span>
            </span>
          </div>
        ))}
      </div>
    </TerminalPanel>
  );
}

export default MarketSummaryPanel;
