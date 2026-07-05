import { useEffect } from 'react';
import { useContractStore } from './store';
import { useTrackingStore, setupKey } from './trackedSetups';

/**
 * Drives the tracked-setups resolution engine from the live terminal feed. Mounted once at
 * the app root. Two triggers:
 *   1. Every serverState change re-prices tracked setups on the currently-observed asset
 *      (real spot + the exact contract's live premium when the terminal is on it).
 *   2. A slow interval so theta decay and time-based expiry still advance when spot is static.
 * Setups whose underlying isn't the active asset are held — we never fabricate their price.
 */
function contextFromState(now: number) {
  const st = useContractStore.getState();
  const ss = st.serverState;
  const asset = st.selectedAsset.ticker;
  const ticker = ss?.contract?.replace('-', ' ').split(' ')[0];
  const spot = ss?.pinpoint_map?.spot_price;
  if (ss && ticker === asset && typeof spot === 'number' && isFinite(spot) && spot > 0) {
    const optionType: 'C' | 'P' = st.selectedOptionType === 'C' ? 'C' : 'P';
    const liveContractKey = st.selectedStrike != null
      ? setupKey({ ticker: asset, strike: st.selectedStrike, optionType, kind: 'contract' })
      : null;
    return { ticker: asset, spot, livePremium: ss.optionPremiumFloat ?? null, liveContractKey, now };
  }
  // No observable spot — still let held setups expire on time.
  return { ticker: '', spot: 0, now };
}

export function useTrackingResolver() {
  const serverState = useContractStore(s => s.serverState);
  const selectedAssetTicker = useContractStore(s => s.selectedAsset.ticker);
  const selectedStrike = useContractStore(s => s.selectedStrike);
  const selectedOptionType = useContractStore(s => s.selectedOptionType);

  // 1. Re-price on every live tick for the observed asset.
  useEffect(() => {
    if (!serverState) return;
    useTrackingStore.getState().updateFromMarket(contextFromState(Date.now()));
  }, [serverState, selectedAssetTicker, selectedStrike, selectedOptionType]);

  // 2. Time tick — theta decay + expiry when the tape is quiet.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => {
      useTrackingStore.getState().updateFromMarket(contextFromState(Date.now()));
    }, 15000);
    return () => window.clearInterval(id);
  }, []);
}
