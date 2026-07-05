import { Crosshair, CheckCircle2, Layers } from 'lucide-react';
import { useContractStore } from '../lib/store';
import { useTrackingStore, setupKey, isTerminal, type TrackDataMode } from '../lib/trackedSetups';
import { toast } from './ui/toast';
import { optionExpiryLabel } from '../data';

/**
 * Track control for Pinpoint. When a specific contract is locked it tracks that option (same
 * lifecycle as SkyVision, source=pinpoint). With no contract selected it tracks the dealer
 * *structure* — a directional bet on the gamma-flip level holding/breaking — rather than
 * pretending a contract exists. Both feed the same Trade History; structure tracks are modeled
 * on the underlying's move (levered ~5x to mimic an ATM option) and clearly labelled.
 */
interface Props {
  spot?: number;
  gammaFlip?: number;
  feedLive?: boolean;
}

export function PinpointTrackButton({ spot, gammaFlip, feedLive }: Props) {
  const selectedAsset = useContractStore(s => s.selectedAsset);
  const selectedStrike = useContractStore(s => s.selectedStrike);
  const selectedOptionType = useContractStore(s => s.selectedOptionType);
  const isContractLocked = useContractStore(s => s.isContractLocked);
  const rawServerState = useContractStore(s => s.serverState);
  const setups = useTrackingStore(s => s.setups);
  const track = useTrackingStore(s => s.track);

  const serverState = rawServerState && rawServerState.contract?.replace('-', ' ').split(' ')[0] === selectedAsset.ticker
    ? rawServerState
    : null;
  const resolvedSpot = spot ?? serverState?.pinpoint_map?.spot_price ?? selectedAsset.defaultPrice;
  const flip = typeof gammaFlip === 'number' && isFinite(gammaFlip) ? gammaFlip : null;
  const dataMode: TrackDataMode = feedLive ? 'live' : serverState ? 'model' : 'sample';

  const hasContract = isContractLocked && selectedStrike != null;
  const optionSide: 'C' | 'P' = selectedOptionType === 'C' ? 'C' : 'P';

  // Dedupe against whatever this button would create.
  const key = hasContract
    ? setupKey({ ticker: selectedAsset.ticker, strike: selectedStrike as number, optionType: optionSide, kind: 'contract' })
    : setupKey({ ticker: selectedAsset.ticker, strike: 0, optionType: 'C', kind: 'structure' });
  const alreadyTracked = setups.some(s => !isTerminal(s.status) && setupKey(s) === key);

  const handleTrack = () => {
    if (hasContract) {
      const strike = selectedStrike as number;
      const premium = serverState?.optionPremiumFloat ?? 1;
      const expiryLabel = optionExpiryLabel(selectedAsset);
      const dteMatch = /(\d+)\s*DTE/i.exec(expiryLabel);
      const dealerReason = flip != null
        ? `${(resolvedSpot >= flip) === (optionSide === 'C') ? 'Supportive' : 'Against'} · flip ${flip.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : 'Dealer structure';
      const res = track({
        source: 'pinpoint',
        dataMode,
        ticker: selectedAsset.ticker,
        contract: `${selectedAsset.ticker} ${strike}${optionSide}`,
        direction: optionSide === 'C' ? 'BULLISH' : 'BEARISH',
        strike,
        expiry: expiryLabel,
        optionType: optionSide,
        setupScore: Math.round(serverState?.system_score ?? 70),
        confidence: Math.round(serverState?.trade_health ?? 70),
        premiumAtTrack: premium,
        spotAtTrack: resolvedSpot,
        expectedMovePct: null,
        invalidationLevel: flip,
        dealerReason,
        volatilityReason: 'From dealer structure',
        liquidityGrade: '—',
        dteDays: dteMatch ? Number(dteMatch[1]) : 0,
      }, Date.now());
      toast[res.duplicate ? 'info' : 'success'](res.duplicate ? 'Already tracking this setup' : 'Setup tracked', {
        description: res.duplicate ? 'It’s in Trade History.' : `${selectedAsset.ticker} ${strike}${optionSide} · now in Trade History`,
      });
      return;
    }

    // Track Market Structure — directional bet on the flip level, modeled on the underlying.
    if (flip == null) {
      toast.warning('No structure level yet', { description: 'Dealer flip level is still resolving.' });
      return;
    }
    const bullish = resolvedSpot >= flip;
    const LEV = 5; // ~ATM-option leverage on the underlying move
    const res = track({
      source: 'pinpoint',
      kind: 'structure',
      dataMode,
      ticker: selectedAsset.ticker,
      contract: `${selectedAsset.ticker} structure`,
      direction: bullish ? 'BULLISH' : 'BEARISH',
      strike: 0,
      expiry: 'Structure',
      optionType: bullish ? 'C' : 'P',
      setupScore: Math.round(serverState?.system_score ?? 65),
      confidence: Math.round(serverState?.trade_health ?? 65),
      premiumAtTrack: 100,
      spotAtTrack: resolvedSpot,
      expectedMovePct: 15,
      invalidationLevel: flip,
      dealerReason: `${bullish ? 'Above' : 'Below'} flip ${flip.toLocaleString(undefined, { maximumFractionDigits: 0 })} — ${bullish ? 'long-gamma support' : 'short-gamma pressure'}`,
      volatilityReason: 'Dealer-structure regime',
      liquidityGrade: '—',
      entryDelta: (bullish ? 1 : -1) * LEV * 100 / Math.max(1, resolvedSpot),
      entryThetaPerDay: 0,
      dteDays: 5,
    }, Date.now());
    toast[res.duplicate ? 'info' : 'success'](res.duplicate ? 'Already tracking this structure' : 'Market structure tracked', {
      description: res.duplicate ? 'It’s in Trade History.' : `${selectedAsset.ticker} · ${bullish ? 'above' : 'below'} flip · now in Trade History`,
    });
  };

  const label = alreadyTracked ? 'Tracking' : hasContract ? 'Track Setup' : 'Track Structure';
  const Icon = alreadyTracked ? CheckCircle2 : hasContract ? Crosshair : Layers;

  return (
    <button
      onClick={alreadyTracked ? () => useContractStore.getState().setActiveTab('auditor', true) : handleTrack}
      aria-label={alreadyTracked ? 'Tracked — open Trade History' : hasContract ? 'Track this contract in Trade History' : 'Track market structure in Trade History'}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--success)] ${
        alreadyTracked
          ? 'border-[var(--success)]/50 bg-[var(--success)]/10 text-[var(--success)]'
          : 'border-[var(--success)]/30 bg-[var(--success)]/5 text-[var(--success)] hover:border-[var(--success)]/60'
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

export default PinpointTrackButton;
