import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Waypoints } from 'lucide-react';

/**
 * Dealer Positioning Network — a live hub-and-spoke graph of the current dealer
 * battlefield: spot at the center, the key structural levels (call/put walls, the
 * gamma-flip line, the pin magnet) as satellites, and animated edges whose flow and
 * thickness encode how hard each level is pulling on price. It re-lays every tick, so
 * the network visibly breathes as spot drifts and levels shift — a spatial companion
 * to the linear gamma map. Read-only; driven entirely by the profile it's handed.
 */

interface LevelNodeData extends Record<string, unknown> {
  label: string;
  value: string;
  sub: string;
  color: string;
  isSpot?: boolean;
}

function LevelNode({ data }: NodeProps<Node<LevelNodeData>>) {
  const { label, value, sub, color, isSpot } = data;
  return (
    <div
      className="rounded-md border px-2.5 py-1.5 text-center font-mono shadow-[0_6px_18px_-10px_rgba(0,0,0,0.9)]"
      style={{
        background: isSpot ? 'color-mix(in srgb, var(--accent-color) 14%, var(--surface))' : 'var(--surface-2)',
        borderColor: color,
        minWidth: isSpot ? 92 : 80,
      }}
    >
      {/* Invisible connection handles — spot is the hub target, levels are sources. */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} isConnectable={false} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} isConnectable={false} />
      <div className="text-[7.5px] font-black uppercase tracking-widest" style={{ color }}>{label}</div>
      <div className="text-[13px] font-bold tabular-nums leading-tight" style={{ color: isSpot ? 'var(--text-primary)' : color }}>{value}</div>
      <div className="text-[7.5px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{sub}</div>
    </div>
  );
}

const nodeTypes = { level: LevelNode };

interface ProfileLike {
  spot?: number;
  callWall?: number;
  putWall?: number;
  gammaFlip?: number;
  magnet?: number | null;
}

function fmtLevel(v: number | undefined, decimals: number) {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: v > 1000 ? 0 : decimals });
}

export function DealerPositioningNetwork({ profile, decimals = 2 }: { profile: ProfileLike | null | undefined; decimals?: number }) {
  const { nodes, edges, ok } = useMemo(() => {
    const spot = profile?.spot;
    if (spot == null || !isFinite(spot) || spot <= 0) {
      return { nodes: [] as Node[], edges: [] as Edge[], ok: false };
    }
    const dist = (lvl?: number | null) => (lvl == null || !isFinite(lvl) ? null : ((lvl - spot) / spot) * 100);
    const distLabel = (d: number | null) => (d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(2)}%`);
    // Closer level → stronger pull → thicker, faster edge. Clamp so a level sitting
    // on top of spot doesn't produce an absurdly fat edge.
    const pull = (d: number | null) => (d == null ? 0 : Math.max(1, Math.min(5, 1.4 / (Math.abs(d) / 100 + 0.006))));

    const sats = [
      { id: 'callWall', label: 'Call Wall', lvl: profile?.callWall, color: 'var(--success)', x: 360, y: 20 },
      { id: 'gammaFlip', label: 'γ-Flip', lvl: profile?.gammaFlip, color: 'var(--warning)', x: 20, y: 20 },
      { id: 'magnet', label: 'Pin Magnet', lvl: profile?.magnet ?? undefined, color: 'var(--info)', x: 375, y: 190 },
      { id: 'putWall', label: 'Put Wall', lvl: profile?.putWall, color: 'var(--danger)', x: 20, y: 190 },
    ];

    const spotNode: Node<LevelNodeData> = {
      id: 'spot',
      type: 'level',
      position: { x: 185, y: 108 },
      // Neutral role label — spot is the anchor every level's pull is measured from.
      // Deliberately NOT a liveness claim: this graph has no feed-status input, so it
      // must not assert "live" while the real feed could be offline/stale.
      data: { label: 'Spot', value: fmtLevel(spot, decimals), sub: 'anchor', color: 'var(--accent-color)', isSpot: true },
      draggable: false,
    };

    const satNodes: Node<LevelNodeData>[] = sats
      .filter((s) => s.lvl != null && isFinite(s.lvl))
      .map((s) => {
        const d = dist(s.lvl);
        return {
          id: s.id,
          type: 'level',
          position: { x: s.x, y: s.y },
          data: { label: s.label, value: fmtLevel(s.lvl, decimals), sub: distLabel(d), color: s.color },
          draggable: false,
        };
      });

    const satEdges: Edge[] = satNodes.map((n) => {
      const s = sats.find((x) => x.id === n.id)!;
      const d = dist(s.lvl);
      const w = pull(d);
      const dominant = s.id === 'magnet';
      return {
        id: `spot-${n.id}`,
        source: 'spot',
        target: n.id,
        animated: true,
        style: { stroke: s.color, strokeWidth: w, opacity: dominant ? 0.95 : 0.7 },
        label: dominant ? 'PULL' : undefined,
        labelStyle: { fill: s.color, fontSize: 8, fontFamily: 'monospace', fontWeight: 700 },
        labelBgStyle: { fill: 'var(--surface)', opacity: 0.8 },
      };
    });

    return { nodes: [spotNode, ...satNodes], edges: satEdges, ok: true };
  }, [profile, decimals]);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2 text-[9px] font-black tracking-widest uppercase text-[var(--text-secondary)]">
        <Waypoints className="w-3.5 h-3.5 text-[var(--accent-color)]" />
        Dealer Positioning Network
        <span className="text-[var(--text-tertiary)] font-normal normal-case tracking-normal">· pull toward spot by proximity</span>
      </div>
      <div className="h-[260px] w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-base)]">
        {ok ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border)" />
          </ReactFlow>
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
            Awaiting dealer positioning…
          </div>
        )}
      </div>
    </div>
  );
}

export default DealerPositioningNetwork;
