import { useEffect, useMemo, useRef, useState } from 'react';
import { LevelAlertsPanel } from './LevelAlertsPanel';
import {
  loadAlerts, saveAlerts, detectCrosses, newAlertId,
  type ArmedAlert, type FiredAlert, type AlertKind, type LevelSource,
} from '../lib/levelAlerts';
import { toast } from './ui/toast';

/**
 * LevelAlerts — the stateful container for the level-cross alert tool. The panel is a controlled
 * view; this owns the armed set (persisted per-ticker to localStorage), watches spot each tick,
 * and fires a toast + fired-log entry when spot crosses an armed dealer level or custom price.
 * Descriptive only — it notifies on a crossing, it never places a trade.
 *
 * Re-mounted into Pinpoint GEX, where the dealer levels (call/put wall, gamma flip, magnet) and
 * the live spot both live.
 */
interface Props {
  ticker: string;
  decimals: number;
  spot?: number;
  callWall?: number;
  putWall?: number;
  gammaFlip?: number;
  magnet?: number;
}

export function LevelAlerts({ ticker, decimals, spot, callWall, putWall, gammaFlip, magnet }: Props) {
  const [allArmed, setAllArmed] = useState<ArmedAlert[]>(() => loadAlerts());
  const [fired, setFired] = useState<FiredAlert[]>([]);
  const prevSpotRef = useRef<number | null>(null);

  const armed = useMemo(() => allArmed.filter(a => a.ticker === ticker), [allArmed, ticker]);
  const src: LevelSource = { callWall, putWall, gammaFlip, magnet };

  useEffect(() => { saveAlerts(allArmed); }, [allArmed]);

  // Reset the crossing baseline when the active ticker changes so a symbol switch never
  // reads as a "cross" from the previous symbol's spot.
  useEffect(() => { prevSpotRef.current = null; }, [ticker]);

  useEffect(() => {
    if (typeof spot !== 'number' || !isFinite(spot)) return;
    const prev = prevSpotRef.current;
    prevSpotRef.current = spot;
    if (prev == null || armed.length === 0) return;
    const crosses = detectCrosses(prev, spot, armed, src, Date.now());
    if (crosses.length) {
      setFired(f => [...crosses, ...f].slice(0, 40));
      for (const c of crosses) {
        toast.info(`${c.label} crossed`, {
          description: `${ticker} ${c.dir === 'up' ? '▲' : '▼'} ${c.spot.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot]);

  const onToggle = (kind: Exclude<AlertKind, 'custom'>) =>
    setAllArmed(a => a.some(x => x.ticker === ticker && x.kind === kind)
      ? a.filter(x => !(x.ticker === ticker && x.kind === kind))
      : [...a, { id: newAlertId(), ticker, kind }]);

  const onAddCustom = (price: number) =>
    setAllArmed(a => [...a, { id: newAlertId(), ticker, kind: 'custom', price, label: `Price ${price.toLocaleString(undefined, { maximumFractionDigits: decimals })}` }]);

  const onRemove = (id: string) => setAllArmed(a => a.filter(x => x.id !== id));
  const onClearFired = () => setFired([]);

  return (
    <LevelAlertsPanel
      armed={armed}
      levels={{ callWall, putWall, gammaFlip, magnet, spot: spot ?? 0 }}
      fired={fired}
      decimals={decimals}
      onToggle={onToggle}
      onAddCustom={onAddCustom}
      onRemove={onRemove}
      onClearFired={onClearFired}
    />
  );
}

export default LevelAlerts;
