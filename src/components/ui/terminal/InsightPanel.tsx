import { TerminalPanel } from './TerminalPanel';

/**
 * InsightPanel — a titled panel of short, real-data-derived bullet insights.
 * Feed it strings generated from actual numbers; it renders nothing fabricated.
 */
export function InsightPanel({ title = 'Positioning Insight', insights, className }: {
  title?: string;
  insights: string[];
  className?: string;
}) {
  return (
    <TerminalPanel title={title} className={className}>
      {insights.length === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">No insight available yet.</p>
      ) : (
        <ul className="space-y-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {insights.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[var(--text-faint)] select-none">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </TerminalPanel>
  );
}

export default InsightPanel;
