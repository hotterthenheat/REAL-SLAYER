/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PINPOINT GEX — the consolidated dealer-positioning workspace. It hosts, under
 * one set of sub-tabs, the exposure/positioning view and the full dealer-hedging
 * analytics that previously lived on their own "Dealer Flow" tab (net-gamma map,
 * pressure matrix, order flow, key levels, options chain, real-time flow, notes)
 * plus the ranked intraday targets. The Live Terminal is a separate standalone
 * tab and is intentionally not embedded here.
 */

import { useEffect, useState, lazy, Suspense } from 'react';
import { useContractStore } from '../lib/store';
import { ToggleGroup } from './ui/ToggleGroup';
import { DealerFlowView } from './DealerFlowView';
import { PanelSkeleton } from './PanelSkeleton';

// Exposure view is a heavier surface (matrix + positioning map) — lazy-load it so
// switching sub-tabs stays snappy.
const PinpointExposureView = lazy(() => import('./PinpointExposureView'));

type PinpointSub = 'exposure' | 'profile' | 'targets';

const SUB_OPTIONS: { value: PinpointSub; label: string }[] = [
  { value: 'exposure', label: 'Exposure & Walls' },
  { value: 'profile', label: 'Hedging Profile' },
  { value: 'targets', label: 'Ranked Targets' },
];

export default function PinpointGexView() {
  const [sub, setSub] = useState<PinpointSub>('exposure');

  // Deep-link from the sidebar flyout: a `pinpoint:<sub>` intent selects the tab.
  const subTabIntent = useContractStore((s) => s.subTabIntent);
  const setSubTabIntent = useContractStore((s) => s.setSubTabIntent);
  useEffect(() => {
    if (!subTabIntent?.startsWith('pinpoint:')) return;
    const next = subTabIntent.split(':')[1] as PinpointSub;
    if (SUB_OPTIONS.some((o) => o.value === next)) setSub(next);
    setSubTabIntent(null);
  }, [subTabIntent, setSubTabIntent]);

  return (
    <div className="space-y-[var(--gap)]">
      <ToggleGroup<PinpointSub>
        ariaLabel="Pinpoint view"
        size="sm"
        value={sub}
        onChange={setSub}
        options={SUB_OPTIONS}
      />

      {sub === 'exposure' && (
        <Suspense fallback={<PanelSkeleton />}>
          <PinpointExposureView />
        </Suspense>
      )}
      {sub === 'profile' && <DealerFlowView forcedView="profile" showToggle={false} />}
      {sub === 'targets' && <DealerFlowView forcedView="targets" showToggle={false} />}
    </div>
  );
}
