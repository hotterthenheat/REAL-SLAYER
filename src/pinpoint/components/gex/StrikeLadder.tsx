import { fmtUsd } from '../../data/gex';
import { heatCellStyle } from './heatmap';
import type { BoardTicker } from '../../types/gex';

interface StrikeLadderProps {
  board: BoardTicker;
}

/** Single-ticker GEX ladder column with the live price embedded between strikes. */
const StrikeLadder = ({ board }: StrikeLadderProps) => {
  const { ticker, spot, changePercent, ladder, ladderMaxAbs } = board;
  const up = changePercent >= 0;

  // Ladder is descending — the spot marker sits under the first strike above spot
  let spotAfterIndex = ladder.findIndex((row, i) => row.strike >= spot && (ladder[i + 1]?.strike ?? -Infinity) < spot);
  if (spotAfterIndex === -1) spotAfterIndex = spot > (ladder[0]?.strike ?? 0) ? -0.5 : ladder.length - 1;

  const total = ladder.reduce((a, r) => a + r.value, 0);

  return (
    <div className="border border-borderSubtle bg-panel rounded-md overflow-hidden flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-2.5 h-8 border-b border-borderSubtle shrink-0 select-none">
        <span className="font-mono text-[11px] font-bold text-textPrimary">{ticker}</span>
        <span className={`font-mono text-[10px] tnum ${up ? 'text-bull' : 'text-bear'}`}>
          {up ? '+' : ''}
          {changePercent.toFixed(2)}%
        </span>
        <span className="ml-auto font-mono text-[9px] text-textMuted uppercase tracking-wider">gex</span>
      </div>

      <div className="flex-grow overflow-y-auto">
        {spotAfterIndex === -0.5 && <SpotMarker ticker={ticker} spot={spot} />}
        {ladder.map((row, i) => (
          <div key={row.strike}>
            <div
              style={heatCellStyle(row.value, ladderMaxAbs)}
              className="flex items-center justify-between px-2.5 py-[5px] border-b border-borderSubtle/30"
            >
              <span className="font-mono text-[10px] font-semibold tnum opacity-75">
                {row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(2)}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tnum">
                {row.king && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#eab308]" />}
                {fmtUsd(row.value)}
              </span>
            </div>
            {i === spotAfterIndex && <SpotMarker ticker={ticker} spot={spot} />}
          </div>
        ))}
      </div>

      <div className="px-2.5 py-1.5 border-t border-borderSubtle flex items-center justify-between select-none shrink-0">
        <span className="font-mono text-[9px] text-textMuted uppercase tracking-wider">Net</span>
        <span className={`font-mono text-[10px] font-bold tnum ${total >= 0 ? 'text-bull' : 'text-bear'}`}>
          {fmtUsd(total)}
        </span>
      </div>
    </div>
  );
};

const SpotMarker = ({ ticker, spot }: { ticker: string; spot: number }) => (
  <div className="flex items-center gap-1.5 px-2 py-[3px] bg-select/[0.07] border-y border-select/40">
    <span className="h-px flex-grow bg-select/40" />
    <span className="font-mono text-[9px] font-bold text-select tnum whitespace-nowrap">
      ▸ {ticker} ${spot.toFixed(2)}
    </span>
    <span className="h-px flex-grow bg-select/40" />
  </div>
);

export default StrikeLadder;
