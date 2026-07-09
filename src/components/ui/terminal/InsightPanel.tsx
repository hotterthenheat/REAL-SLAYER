import React from 'react';
import TerminalPanel from './TerminalPanel';
import StatusBadge, { type BadgeTone } from './StatusBadge';

/**
 * InsightPanel — the right-rail insight/thesis block. Two supported shapes:
 *   • `sections` (canonical): labeled sections of label/value rows with tones.
 *   • `insights` (legacy): a flat list of real-data-derived bullet strings.
 * Feed it only strings/values generated from actual numbers — it renders
 * nothing fabricated, and an empty feed states so honestly.
 */
export type InsightItem = {
  label?: string;
  value: React.ReactNode;
  tone?: BadgeTone;
};

export type InsightSection = {
  heading: string;
  items: InsightItem[];
};

type InsightPanelProps = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: {
    label: React.ReactNode;
    tone?: BadgeTone;
  };
  sections?: InsightSection[];
  /** @deprecated compat: flat bullet list of derived insight strings */
  insights?: string[];
  footer?: React.ReactNode;
  className?: string;
};

const itemTone = (tone?: BadgeTone): string => {
  switch (tone) {
    case 'positive': return 'text-[var(--positive-ink)]';
    case 'negative': return 'text-[var(--negative-ink)]';
    case 'warning': return 'text-[var(--warning)]';
    case 'call': return 'text-[var(--call)]';
    case 'pin': return 'text-[var(--pin)]';
    default: return 'text-[var(--text-primary)]';
  }
};

export function InsightPanel({
  title = 'Insight',
  subtitle,
  badge,
  sections,
  insights,
  footer,
  className,
}: InsightPanelProps) {
  const hasSections = !!sections && sections.length > 0;
  const hasInsights = !!insights && insights.length > 0;
  return (
    <TerminalPanel
      className={className}
      title={title}
      subtitle={subtitle}
      actions={badge ? <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge> : null}
      footer={footer}
    >
      {hasSections ? (
        <div className="space-y-4">
          {sections!.map((section) => (
            <div key={section.heading}>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {section.heading}
              </div>
              <div className="space-y-2">
                {section.items.map((item, index) => (
                  <div
                    key={`${section.heading}-${index}`}
                    className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1 text-[12px] text-[var(--text-secondary)]">
                      {item.label ?? '—'}
                    </div>
                    <div className={cxRight(item.tone)}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : hasInsights ? (
        <ul className="space-y-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {insights!.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="select-none text-[var(--text-faint)]">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-[var(--text-muted)]">No insight — waiting on feed.</p>
      )}
    </TerminalPanel>
  );
}

function cxRight(tone?: BadgeTone): string {
  return `max-w-[60%] text-right text-[12px] font-medium ${itemTone(tone)}`;
}

export default InsightPanel;
