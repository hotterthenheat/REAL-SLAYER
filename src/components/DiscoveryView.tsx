import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  Search,
  ShieldAlert,
  Flame,
  Database,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Target,
  Info,
  X
} from 'lucide-react';
import { AssetInfo } from '../types';
import { ASSET_LIST } from '../data';
import { useContractStore } from '../lib/store';
import { formatTime } from '../lib/timeUtils';
import { fmtNum } from '../lib/format';
import { AssetSparkline } from './AssetSparkline';
import { DataStateBadge } from './ui/DataStateBadge';
import { SearchInput } from './ui/SearchInput';
import { deriveSetup, SetupRow, SetupInspector, type ScannerContract } from './scanner/SetupQueue';

interface DiscoveryViewProps {
  systemScore: any;
  discovery?: {
    mispricedCalls: any[];
    mispricedPuts: any[];
    mostImproved: any[];
    nearInvalidation: any[];
  };
  onSelectContract: (asset: AssetInfo, strike: number, isCall: boolean) => void;
}

// SAMPLE / ILLUSTRATIVE options tiles — static demo rows used to seed the layout
// before/without a connected options feed. These are NOT a live scan and the
// numbers are placeholders; the UI labels this view "SAMPLE DATA".
const INITIAL_CONTRACTS = [
  // SHELF: CONVICTION
  {
    id: 'spx-7620-c',
    ticker: 'SPX',
    strike: 5520,
    isCall: true,
    health: 96,
    expectedMove: '+42.5%',
    action: 'ENTER' as const,
    narrative: 'Heavy institutional volume cluster matched. Dealer buy walls are perfectly positioned.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.54,
    gamma: 0.024,
    vega: 0.14,
    theta: -0.81,
    volume: 14205,
    price: 5.40,
    bid: 5.35,
    ask: 5.45,
    t1: 7.20,
    p1: 33
  },
  {
    id: 'spy-515-c',
    ticker: 'SPY',
    strike: 515,
    isCall: true,
    health: 93,
    expectedMove: '+36.2%',
    action: 'ENTER' as const,
    narrative: 'Unusually clean volume profile confirms call momentum.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.48,
    gamma: 0.038,
    vega: 0.12,
    theta: -0.45,
    volume: 38201,
    price: 3.20,
    bid: 3.18,
    ask: 3.22,
    t1: 4.35,
    p1: 36
  },
  {
    id: 'qqq-448-c',
    ticker: 'QQQ',
    strike: 448,
    isCall: true,
    health: 91,
    expectedMove: '+29.0%',
    action: 'ENTER' as const,
    narrative: 'Dealer block purchases confirm near-term floor.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.52,
    gamma: 0.041,
    vega: 0.15,
    theta: -0.55,
    volume: 22401,
    price: 4.20,
    bid: 4.15,
    ask: 4.25,
    t1: 5.40,
    p1: 29
  },
  {
    id: 'ndx-18350-c',
    ticker: 'NDX',
    strike: 18350,
    isCall: true,
    health: 90,
    expectedMove: '+31.4%',
    action: 'ENTER' as const,
    narrative: 'Rapid acceleration in derivative order flow on Nasdaq nodes.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.49,
    gamma: 0.015,
    vega: 0.18,
    theta: -1.25,
    volume: 5204,
    price: 15.50,
    bid: 15.30,
    ask: 15.70,
    t1: 20.30,
    p1: 31
  },
  {
    id: 'spx-7600-c',
    ticker: 'SPX',
    strike: 5500,
    isCall: true,
    health: 95,
    expectedMove: '+39.1%',
    action: 'ENTER' as const,
    narrative: 'Below spot magnet concentration attracts structural institutional buyer hedging.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.62,
    gamma: 0.021,
    vega: 0.13,
    theta: -0.92,
    volume: 18940,
    price: 11.20,
    bid: 11.10,
    ask: 11.30,
    t1: 15.60,
    p1: 39
  },
  {
    id: 'spy-510-c',
    ticker: 'SPY',
    strike: 510,
    isCall: true,
    health: 92,
    expectedMove: '+34.8%',
    action: 'ENTER' as const,
    narrative: 'Slayer deep learning index detects massive localized volume sweep.',
    tagText: 'CONVICTION',
    shelf: 'conviction',
    delta: 0.58,
    gamma: 0.035,
    vega: 0.13,
    theta: -0.48,
    volume: 45100,
    price: 5.10,
    bid: 5.05,
    ask: 5.15,
    t1: 6.85,
    p1: 34
  },

  // SHELF: IMPROVED / VELOCITY
  {
    id: 'ndx-18300-c',
    ticker: 'NDX',
    strike: 18300,
    isCall: true,
    health: 89,
    expectedMove: '+55.2%',
    action: 'ENTER' as const,
    narrative: 'Rapid jump in scoring index over the last 15 minutes. High expansion.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.58,
    gamma: 0.018,
    vega: 0.19,
    theta: -1.15,
    volume: 6310,
    price: 14.20,
    bid: 14.05,
    ask: 14.35,
    t1: 22.01,
    p1: 55
  },
  {
    id: 'qqq-446-c',
    ticker: 'QQQ',
    strike: 446,
    isCall: true,
    health: 88,
    expectedMove: '+32.4%',
    action: 'ENTER' as const,
    narrative: 'Dealer short blocks have dissolved, freeing up massive room overhead.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.54,
    gamma: 0.043,
    vega: 0.16,
    theta: -0.58,
    volume: 29402,
    price: 3.80,
    bid: 3.75,
    ask: 3.85,
    t1: 5.05,
    p1: 32
  },
  {
    id: 'spy-514-c',
    ticker: 'SPY',
    strike: 514,
    isCall: true,
    health: 87,
    expectedMove: '+28.5%',
    action: 'ENTER' as const,
    narrative: 'Score rating surges as dealers transition from negative gamma to neutral gamma.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.51,
    gamma: 0.039,
    vega: 0.12,
    theta: -0.46,
    volume: 18920,
    price: 2.80,
    bid: 2.77,
    ask: 2.83,
    t1: 3.60,
    p1: 28
  },
  {
    id: 'spx-7660-c',
    ticker: 'SPX',
    strike: 5560,
    isCall: true,
    health: 86,
    expectedMove: '+45.0%',
    action: 'ENTER' as const,
    narrative: 'Breakout momentum identified. Standard dispersion limit predicts vol expansion.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.42,
    gamma: 0.019,
    vega: 0.14,
    theta: -0.84,
    volume: 9811,
    price: 4.80,
    bid: 4.70,
    ask: 4.90,
    t1: 6.95,
    p1: 45
  },
  {
    id: 'qqq-450-c',
    ticker: 'QQQ',
    strike: 450,
    isCall: true,
    health: 85,
    expectedMove: '+26.8%',
    action: 'ENTER' as const,
    narrative: 'Derivative speed indices ticking straight up; fast buy feedback loop active.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.46,
    gamma: 0.040,
    vega: 0.17,
    theta: -0.61,
    volume: 15400,
    price: 2.65,
    bid: 2.61,
    ask: 2.69,
    t1: 3.35,
    p1: 26
  },
  {
    id: 'spx-7640-c',
    ticker: 'SPX',
    strike: 5540,
    isCall: true,
    health: 88,
    expectedMove: '+30.2%',
    action: 'ENTER' as const,
    narrative: 'Rapid acceleration in order flow profile matches strong buy trend.',
    tagText: 'VELOCITY',
    shelf: 'improved',
    delta: 0.52,
    gamma: 0.022,
    vega: 0.13,
    theta: -0.85,
    volume: 12401,
    price: 6.80,
    bid: 6.70,
    ask: 6.90,
    t1: 8.85,
    p1: 30
  },

  // SHELF: MISPRICED / ARBITRAGE
  {
    id: 'spy-442-p',
    ticker: 'SPY',
    strike: 442,
    isCall: false,
    health: 85,
    expectedMove: '+24.1%',
    action: 'HOLD' as const,
    narrative: 'Valuation curve points to an extreme temporary discount on deep puts.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.12,
    gamma: 0.008,
    vega: 0.06,
    theta: -0.15,
    volume: 5310,
    price: 0.45,
    bid: 0.43,
    ask: 0.47,
    t1: 0.55,
    p1: 22
  },
  {
    id: 'spx-7650-c',
    ticker: 'SPX',
    strike: 5550,
    isCall: true,
    health: 83,
    expectedMove: '+18.5%',
    action: 'HOLD' as const,
    narrative: 'Priced exceptionally cheap relative to general spot move; heavy IV discount.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: 0.45,
    gamma: 0.020,
    vega: 0.14,
    theta: -0.83,
    volume: 8105,
    price: 5.10,
    bid: 5.00,
    ask: 5.20,
    t1: 6.05,
    p1: 18
  },
  {
    id: 'spy-508-p',
    ticker: 'SPY',
    strike: 508,
    isCall: false,
    health: 81,
    expectedMove: '+20.5%',
    action: 'HOLD' as const,
    narrative: 'Theoretical model price sits at $1.85, while active broker ask is $1.35.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.38,
    gamma: 0.025,
    vega: 0.11,
    theta: -0.32,
    volume: 12502,
    price: 1.35,
    bid: 1.32,
    ask: 1.38,
    t1: 1.62,
    p1: 20
  },
  {
    id: 'spx-7590-p',
    ticker: 'SPX',
    strike: 5490,
    isCall: false,
    health: 84,
    expectedMove: '+27.0%',
    action: 'ENTER' as const,
    narrative: 'Implied volatility suppression created a perfect risk-to-reward underpricing node.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.41,
    gamma: 0.018,
    vega: 0.13,
    theta: -0.75,
    volume: 7500,
    price: 12.80,
    bid: 12.60,
    ask: 13.00,
    t1: 16.25,
    p1: 27
  },
  {
    id: 'qqq-442-p',
    ticker: 'QQQ',
    strike: 442,
    isCall: false,
    health: 80,
    expectedMove: '+19.2%',
    action: 'HOLD' as const,
    narrative: 'Underpriced hedge option with high delta sensitivity relative to current spot.',
    tagText: 'MISPRICED',
    shelf: 'mispriced',
    delta: -0.39,
    gamma: 0.034,
    vega: 0.14,
    theta: -0.42,
    volume: 16210,
    price: 2.15,
    bid: 2.12,
    ask: 2.18,
    t1: 2.56,
    p1: 19
  },
  {
    id: 'ndx-18200-p',
    ticker: 'NDX',
    strike: 18200,
    isCall: false,
    health: 82,
    expectedMove: '+22.4%',
    action: 'HOLD' as const,
    narrative: 'Strong theoretical offset detected. Arbitrage spread calculated at 14.5%.',
    tagText: 'ARBITRAGE',
    shelf: 'mispriced',
    delta: -0.44,
    gamma: 0.014,
    vega: 0.18,
    theta: -1.10,
    volume: 3840,
    price: 42.10,
    bid: 41.50,
    ask: 42.70,
    t1: 51.50,
    p1: 22
  },

  // SHELF: INVALIDATION / BOUNDARIES
  {
    id: 'spx-7610-p',
    ticker: 'SPX',
    strike: 5510,
    isCall: false,
    health: 48,
    expectedMove: '-15.4%',
    action: 'REDUCE' as const,
    narrative: 'Slipped past main dealer GEX hedge floor. Tail risk exponentially flashing high.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.42,
    gamma: 0.021,
    vega: 0.13,
    theta: -0.85,
    volume: 15401,
    price: 18.50,
    bid: 18.30,
    ask: 18.70,
    t1: 15.65,
    p1: -15
  },
  {
    id: 'spy-440-p',
    ticker: 'SPY',
    strike: 440,
    isCall: false,
    health: 51,
    expectedMove: '-10.2%',
    action: 'SELL' as const,
    narrative: 'Liquidity sweep void detected below current level. Immediate defensive alert.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.10,
    gamma: 0.005,
    vega: 0.05,
    theta: -0.12,
    volume: 24500,
    price: 0.35,
    bid: 0.33,
    ask: 0.37,
    t1: 0.31,
    p1: -10
  },
  {
    id: 'spx-7580-p',
    ticker: 'SPX',
    strike: 5480,
    isCall: false,
    health: 41,
    expectedMove: '-24.0%',
    action: 'SELL' as const,
    narrative: 'Extreme threshold crossover boundary triggers automatic institutional liquidation.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.32,
    gamma: 0.016,
    vega: 0.12,
    theta: -0.80,
    volume: 11040,
    price: 8.50,
    bid: 8.35,
    ask: 8.65,
    t1: 6.45,
    p1: -24
  },
  {
    id: 'spy-502-p',
    ticker: 'SPY',
    strike: 502,
    isCall: false,
    health: 45,
    expectedMove: '-18.5%',
    action: 'SELL' as const,
    narrative: 'Brushed beneath primary dealer put wall support. Hedging dynamics turned negative.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.28,
    gamma: 0.022,
    vega: 0.09,
    theta: -0.28,
    volume: 19105,
    price: 2.10,
    bid: 2.05,
    ask: 2.15,
    t1: 1.71,
    p1: -18
  },
  {
    id: 'qqq-438-p',
    ticker: 'QQQ',
    strike: 438,
    isCall: false,
    health: 49,
    expectedMove: '-14.0%',
    action: 'REDUCE' as const,
    narrative: 'Unwinds beneath crucial volume-weighted index pivot. Support levels dissolve.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.31,
    gamma: 0.028,
    vega: 0.12,
    theta: -0.38,
    volume: 14210,
    price: 3.15,
    bid: 3.10,
    ask: 3.20,
    t1: 2.70,
    p1: -14
  },
  {
    id: 'ndx-18100-p',
    ticker: 'NDX',
    strike: 18100,
    isCall: false,
    health: 38,
    expectedMove: '-32.5%',
    action: 'SELL' as const,
    narrative: 'System score degraded as gamma flip point triggers extreme margin sell hedging.',
    tagText: 'INVALIDATION',
    shelf: 'invalidation',
    delta: -0.36,
    gamma: 0.010,
    vega: 0.16,
    theta: -1.02,
    volume: 2901,
    price: 28.50,
    bid: 28.00,
    ask: 29.00,
    t1: 19.20,
    p1: -32
  },

  // SHELF: WHALE SWEEPS
  {
    id: 'spx-7700-c',
    ticker: 'SPX',
    strike: 5600,
    isCall: true,
    health: 94,
    expectedMove: '+62.4%',
    action: 'ENTER' as const,
    narrative: 'Block institutional trades sweep SPX 5600 strike, representing $14.2M notional.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.35,
    gamma: 0.018,
    vega: 0.15,
    theta: -0.78,
    volume: 62400,
    price: 2.45,
    bid: 2.40,
    ask: 2.50,
    t1: 3.98,
    p1: 62
  },
  {
    id: 'ndx-18500-c',
    ticker: 'NDX',
    strike: 18500,
    isCall: true,
    health: 91,
    expectedMove: '+75.0%',
    action: 'ENTER' as const,
    narrative: 'Massive out-of-the-money block trade cluster. Aggressive bullish volatility positioning.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.30,
    gamma: 0.010,
    vega: 0.17,
    theta: -1.08,
    volume: 11400,
    price: 8.90,
    bid: 8.70,
    ask: 9.10,
    t1: 15.55,
    p1: 75
  },
  {
    id: 'spy-520-c',
    ticker: 'SPY',
    strike: 520,
    isCall: true,
    health: 89,
    expectedMove: '+44.1%',
    action: 'ENTER' as const,
    narrative: 'Sweeps executed on Ask price consistently over the last 10 minutes. Bull run.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.34,
    gamma: 0.031,
    vega: 0.11,
    theta: -0.40,
    volume: 92400,
    price: 1.15,
    bid: 1.12,
    ask: 1.18,
    t1: 1.65,
    p1: 44
  },
  {
    id: 'qqq-455-c',
    ticker: 'QQQ',
    strike: 455,
    isCall: true,
    health: 88,
    expectedMove: '+38.5%',
    action: 'ENTER' as const,
    narrative: 'Multimillion institutional block sweep targeting the upper resistance channel wall.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: 0.32,
    gamma: 0.033,
    vega: 0.13,
    theta: -0.52,
    volume: 51200,
    price: 1.45,
    bid: 1.41,
    ask: 1.49,
    t1: 2.01,
    p1: 38
  },
  {
    id: 'spx-7500-p',
    ticker: 'SPX',
    strike: 5400,
    isCall: false,
    health: 85,
    expectedMove: '+52.0%',
    action: 'HOLD' as const,
    narrative: 'Huge defensive protective put basket sweep ($22.4M notional hedge) detected.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: -0.19,
    gamma: 0.010,
    vega: 0.09,
    theta: -0.55,
    volume: 48900,
    price: 4.80,
    bid: 4.70,
    ask: 4.90,
    t1: 7.30,
    p1: 52
  },
  {
    id: 'ndx-17800-p',
    ticker: 'NDX',
    strike: 17800,
    isCall: false,
    health: 83,
    expectedMove: '+48.5%',
    action: 'HOLD' as const,
    narrative: 'Significant tail protection sweep blocks are locking up hedge positions at put wall.',
    tagText: 'WHALE',
    shelf: 'whale',
    delta: -0.15,
    gamma: 0.008,
    vega: 0.12,
    theta: -0.78,
    volume: 8520,
    price: 12.40,
    bid: 12.10,
    ask: 12.70,
    t1: 18.40,
    p1: 48
  }
];

// Seed initial historical feed logs
// Monotonic id source so prepended feed logs keep stable React keys (timestamps
// are only second-granularity and indices shift on every prepend).
let _feedLogSeq = 0;
const nextFeedLogId = () => `feedlog-${++_feedLogSeq}`;

const INITIAL_FEED_LOGS = [
  { id: nextFeedLogId(), timestamp: '01:34:25 PM', ticker: 'SPX', strike: 5520, type: 'C', side: 'Sweep', size: '280 cons', premium: '$151,200', tag: 'BULLISH', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:34:10 PM', ticker: 'QQQ', strike: 448, type: 'C', side: 'Block', size: '1,200 cons', premium: '$504,000', tag: 'BULLISH', action: 'AT ASK' },
  { id: nextFeedLogId(), timestamp: '01:33:48 PM', ticker: 'NDX', strike: 18350, type: 'C', side: 'Block', size: '150 cons', premium: '$232,500', tag: 'BULLISH', action: 'ABOVE ASK' },
  { id: nextFeedLogId(), timestamp: '01:33:02 PM', ticker: 'SPY', strike: 508, type: 'P', side: 'Sweep', size: '2,500 cons', premium: '$337,500', tag: 'BEARISH', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:31:55 PM', ticker: 'SPX', strike: 5600, type: 'C', side: 'Block', size: '3,000 cons', premium: '$735,000', tag: 'BULLISH', action: 'OFF-EXCHANGE' },
  { id: nextFeedLogId(), timestamp: '01:30:22 PM', ticker: 'NDX', strike: 17800, type: 'P', side: 'Sweep', size: '400 cons', premium: '$496,000', tag: 'HEDGE', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:29:15 PM', ticker: 'SPY', strike: 515, type: 'C', side: 'Sweep', size: '1,800 cons', premium: '$576,000', tag: 'BULLISH', action: 'SWEPT @ ASK' },
  { id: nextFeedLogId(), timestamp: '01:28:40 PM', ticker: 'QQQ', strike: 455, type: 'C', side: 'Sweep', size: '2,400 cons', premium: '$348,000', tag: 'BULLISH', action: 'ABOVE ASK' }
];

export function DiscoveryView({
  systemScore,
  discovery,
  onSelectContract
}: DiscoveryViewProps) {
  const themeMode = useContractStore(s => s.themeMode);
  const isLight = themeMode === 'light';

  const [contracts, setContracts] = useState(INITIAL_CONTRACTS);
  const [expandedContracts, setExpandedContracts] = useState<Record<string, boolean>>({});
  const [activeShelf, setActiveShelf] = useState<'conviction' | 'improved' | 'mispriced' | 'invalidation' | 'whale' | 'all'>('conviction');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSearchAssets = ASSET_LIST.filter(a => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  });

  const filteredSearchContracts = contracts.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return c.ticker.toLowerCase().includes(q) || String(c.strike).includes(q) || (c.ticker + ' ' + c.strike).toLowerCase().includes(q);
  });

  const [optionTypeFilter, setOptionTypeFilter] = useState<'all' | 'calls' | 'puts'>('all');
  const [feedLogs, setFeedLogs] = useState(INITIAL_FEED_LOGS);
  // True when the sample discovery SSE stream drops; surfaced as a subtle
  // "reconnecting" chip on the tape (the browser EventSource auto-reconnects).
  const [feedError, setFeedError] = useState(false);
  const [lastFlashingId, setLastFlashingId] = useState<string | null>(null);
  const [flashDirection, setFlashDirection] = useState<'up' | 'down'>('up');
  const [metricsPulse, setMetricsPulse] = useState(false);

  // Strategy Manual & target logic reasons dictionary (explanations in simple words why they are the best).
  // Collapsed by default per the redesign — education must not dominate the scanner page.
  const [isStrategyExpanded, setIsStrategyExpanded] = useState(false);
  const [isSupportingOpen, setIsSupportingOpen] = useState(false);
  // The row the right-rail inspector describes; defaults to the top-ranked setup.
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  const [isMockScanning, setIsMockScanning] = useState(false);
  const [lastScanMessage, setLastScanMessage] = useState('Ready. Scan complete.');
  const [scanHistoryCount, setScanHistoryCount] = useState(0);

  const SHELF_EXPLANATIONS = {
    conviction: {
      title: "Core Conviction Setups (High Probability Positions)",
      whyItsBest: "Setups supported by concentrated dealer buy walls where market makers are positioned to defend price — strong support, but not a guarantee; all options carry risk.",
      horizon: "1 TO 3 DAYS (SWING)",
      mathTracking: "Strong dealer buy-walls sitting under price",
      confidenceTier: "Model confidence: Very High"
    },
    improved: {
      title: "High Velocity Breakouts (Quick Scalp Trades)",
      whyItsBest: "Momentum setups with rapidly accelerating volume. Useful for quick day trading (scalping): derivative volumes are speeding up in the last 15 minutes as buyers sweep options at the ask, which can force dealers to cover their shorts and drive price up.",
      horizon: "15 MIN TO 3 HOURS (SCALP)",
      mathTracking: "Fast volume and momentum building",
      confidenceTier: "Model confidence: High"
    },
    mispriced: {
      title: "Mathematical Arbitrage (Option Premium Discounts)",
      whyItsBest: "These are deep value opportunities where options are priced exceptionally cheap. They are 'the best' because temporary implied volatility drops have created a price mismatch: active brokers are selling these contracts at a -15% discount compared to their true mathematical value. Enter cheap, exit under normal curves.",
      horizon: "2 HOURS TO 1 DAY (VALUE)",
      mathTracking: "Option priced below fair value",
      confidenceTier: "Model confidence: Solid"
    },
    invalidation: {
      title: "Support Rebounds & Boundaries (Trades Coming Back)",
      whyItsBest: "These are options hovering right at critical line-in-the-sand support thresholds. They are 'the best' for reversals because they are 'coming back' to key support lines (put walls), offering a highly defined bounce-back entry with tight, predefined stop-losses.",
      horizon: "30 MIN TO 2 HOURS (BOUNCE)",
      mathTracking: "Bouncing off dealer put-wall support",
      confidenceTier: "Model confidence: Speculative"
    },
    whale: {
      title: "Institutional Block Sweeps",
      whyItsBest: "Large institutional block orders executing at the ask, following concentrated directional flow from major market participants.",
      horizon: "1 HOUR TO 2 DAYS (SWING)",
      mathTracking: "$5M+ block trades hitting the tape",
      confidenceTier: "Model confidence: High"
    },
    all: {
      title: "All Discovered Signals (Unified Market Catalog)",
      whyItsBest: "A unified look across the entire option spectrum under scanning supervision. Use this tab to compare all categories side-by-side, sorted from the absolute strongest active model ratings to the weakest.",
      horizon: "Dependent on Selection",
      mathTracking: "All signals combined",
      confidenceTier: "All setups"
    }
  };

  // Helper function to formulate simple human reasons why each specific card is the best
  const getSimpleWordReason = (c: any) => {
    const isCall = c.isCall;
    if (c.shelf === 'conviction') {
      return `Solid institutional buy walls are supporting price at ${c.strike}. Option market makers are heavily short this strike and must buy stock to remain hedged, forming an automatic protective floor under our entry target.`;
    } else if (c.shelf === 'improved') {
      return `Rapid volume surge detected over the last few minutes. Buyers are sweeping contracts on the ask, preparing the asset for a classic option squeeze. High-velocity setup ideal for a quick, fast-exit momentum scalp.`;
    } else if (c.shelf === 'mispriced') {
      return `Illustrative example of a model/market gap: a sample ask of $${c.price.toFixed(2)} against a sample model value of $${(c.price * 1.4).toFixed(2)}. Demo data — not a live mispricing.`;
    } else if (c.shelf === 'invalidation') {
      return `Option is coming back to primary support buffers. Hovering right near the crucial put wall invalidation level. Entering here offers a safe, highly-defined rebound setup with extremely tight loss limits.`;
    } else if (c.shelf === 'whale') {
      return `Multi-million dollar blocks are sweeping this exact strike. This is institutional smart money committing heavy leverage, forcing dealer market makers to rapidly buy hedge blocks. Excellent tailwind trade.`;
    }
    return `High-scoring index anomaly active. Positive order flow momentum backing are aligned with dealer positioning and index support.`;
  };

  // Stats tickers that change slightly
  const [brierScore, setBrierScore] = useState(0.042);
  const [globalGex, setGlobalGex] = useState(485.4);
  const [scanRate, setScanRate] = useState(14.8);
  // Wall-clock of the last sample-metric tick, shown as an "as of" caption so the
  // illustrative readouts carry a freshness cue (consistent with the SAMPLE label).
  const [metricsAsOf, setMetricsAsOf] = useState<number>(() => Date.now());

  // Subscribe to the backend discovery SSE stream. NOTE: this stream currently
  // carries the SAMPLE seed rows with light server-side jitter — it does not read
  // the live option chain/flows — so the view presents it as sample/demo data.
  useEffect(() => {
    const url = '/api/stream/discovery';
    const eventSource = new EventSource(url);
    const flashTimers: ReturnType<typeof setTimeout>[] = [];

    eventSource.onopen = () => {
      // A successful (re)connection clears any prior error chip.
      setFeedError(false);
    };

    eventSource.onmessage = (event) => {
      try {
        // Any delivered message means the stream is healthy again.
        setFeedError(false);
        const data = JSON.parse(event.data);
        if (data.contracts) setContracts(data.contracts);
        if (data.feedLogs) setFeedLogs(data.feedLogs);
        if (typeof data.brierScore === 'number') setBrierScore(data.brierScore);
        if (typeof data.globalGex === 'number') setGlobalGex(data.globalGex);
        if (typeof data.scanRate === 'number') setScanRate(data.scanRate);
        if (typeof data.brierScore === 'number' || typeof data.globalGex === 'number' || typeof data.scanRate === 'number') {
          setMetricsAsOf(Date.now());
        }
        if (data.lastFlashingId) {
          setLastFlashingId(data.lastFlashingId);
          if (data.flashDirection) setFlashDirection(data.flashDirection);

          setMetricsPulse(true);
          flashTimers.push(setTimeout(() => setMetricsPulse(false), 500));
          flashTimers.push(setTimeout(() => setLastFlashingId(null), 700));
        }
      } catch (err) {
        console.error('[SkyVision Discovery Client] Error parsing SSE Stream', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[SkyVision Discovery Client] EventSource Error', err);
      // Surface a subtle reconnecting state without tearing down the pipeline —
      // EventSource reconnects on its own; onopen/onmessage will clear this.
      setFeedError(true);
    };

    return () => {
      eventSource.close();
      flashTimers.forEach(clearTimeout);
    };
  }, []);

  // SAMPLE animation only: gently jitters the demo tile prices so the illustrative
  // layout isn't perfectly static. This is NOT a live market feed — it runs purely
  // on the SAMPLE seed rows and is presented under the view's "SAMPLE DATA" label.
  useEffect(() => {
    const flashTimers: ReturnType<typeof setTimeout>[] = [];
    const tickInterval = setInterval(() => {
      // Compute purely inside the updater; collect the flash side-effect to run AFTER.
      let flashedId: any = null;
      let flashDir: 'up' | 'down' = 'up';
      setContracts(prev => {
        return prev.map(c => {
          // 8% chance of tick fluctuation on any option premium row
          if (Math.random() > 0.92) {
            const isUp = Math.random() > 0.48;
            const deviation = Number((Math.random() * 0.05 + 0.01).toFixed(2));
            const newPrice = isUp ? c.price + deviation : c.price - deviation;
            const nextPrice = Math.max(0.15, Number(newPrice.toFixed(2)));
            const bidDev = isUp ? c.bid + (deviation * 0.9) : c.bid - (deviation * 0.9);
            const askDev = isUp ? c.ask + (deviation * 1.1) : c.ask - (deviation * 1.1);

            flashedId = c.id;
            flashDir = isUp ? 'up' : 'down';

            return {
              ...c,
              price: nextPrice,
              bid: Math.max(0.10, Number(bidDev.toFixed(2))),
              ask: Math.max(0.20, Number(askDev.toFixed(2)))
            };
          }
          return c;
        });
      });
      // Side effects OUTSIDE the reducer — avoids duplicate timers/state under
      // StrictMode/concurrent rendering (the updater can run twice).
      if (flashedId) {
        setLastFlashingId(flashedId);
        setFlashDirection(flashDir);
        flashTimers.push(setTimeout(() => setLastFlashingId(null), 600));
      }
    }, 2800);

    return () => { clearInterval(tickInterval); flashTimers.forEach(clearTimeout); };
  }, []);

  // Manual scan refresh: re-ticks local contract premiums and appends a fresh
  // tape entry. Server-streamed metrics (GEX / accuracy / scan-rate) are left
  // untouched — they update on their own via the discovery SSE stream.
  const triggerManualScannerRefresh = () => {
    if (isMockScanning) return;
    setIsMockScanning(true);
    setLastScanMessage('Running a fresh scan...');

    setTimeout(() => {
      let scannedCount = 0;
      setContracts(prev => {
        scannedCount = prev.length;
        return prev.map(c => {
          const shiftPercent = 1 + (Math.random() * 0.04 - 0.02); // +/-2%
          const newPrice = Math.max(0.15, Number((c.price * shiftPercent).toFixed(2)));
          return {
            ...c,
            price: newPrice,
            bid: Math.max(0.10, Number((newPrice * 0.98).toFixed(2))),
            ask: Math.max(0.20, Number((newPrice * 1.02).toFixed(2)))
          };
        });
      });

      // Insert fresh scalp feed log to show raw activity across the full launch universe.
      const randomAsset = ASSET_LIST[Math.floor(Math.random() * ASSET_LIST.length)];
      const randomTicker = randomAsset.ticker;
      const feedStep = randomAsset.defaultPrice > 1000 ? 50 : randomAsset.defaultPrice > 150 ? 5 : 1;
      const randomStrike = Math.round(randomAsset.defaultPrice / feedStep) * feedStep;
      const randomIsBullish = Math.random() > 0.4;
      const timestampLabel = formatTime(new Date());

      const newLog = {
        id: nextFeedLogId(),
        timestamp: timestampLabel,
        ticker: randomTicker,
        strike: randomStrike,
        type: randomIsBullish ? 'C' : 'P',
        side: Math.random() > 0.5 ? 'Sweep' : 'Block',
        size: `${Math.floor(Math.random() * 1500 + 400)} cons`,
        premium: `$${((Math.floor(Math.random() * 400 + 100)) * 1000).toLocaleString()}`,
        tag: randomIsBullish ? 'BULLISH' : 'HEDGE',
        action: randomIsBullish ? 'SWEPT @ ASK' : 'AT BID'
      };

      setFeedLogs(prev => [newLog, ...prev.slice(0, 11)]);
      setIsMockScanning(false);
      setScanHistoryCount(prev => prev + 1);
      setLastScanMessage(`Scan complete. ${scannedCount} contracts re-priced.`);
    }, 1000);
  };

  // Combined filtering of our expanded database
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      // 1. Shelf check
      if (activeShelf !== 'all' && c.shelf !== activeShelf) {
        return false;
      }
      // 2. Call/Put check
      if (optionTypeFilter === 'calls' && !c.isCall) return false;
      if (optionTypeFilter === 'puts' && c.isCall) return false;
      
      // 3. Search query check (search strike or ticker)
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toUpperCase();
        const matchesTicker = c.ticker.includes(query);
        const matchesStrike = String(c.strike).includes(query);
        const matchesType = (query === 'C' || query === 'CALL') ? c.isCall : (query === 'P' || query === 'PUT') ? !c.isCall : false;
        return matchesTicker || matchesStrike || matchesType;
      }
      return true;
    });
  }, [contracts, activeShelf, optionTypeFilter, searchQuery]);

  // GROUP TICKER SEPARATION SYSTEM (Separate per ticker SPX, NDX, QQQ, SPY)
  // Inside each ticker group, sort contracts from STRONGEST (highest rating) to WEAKEST (lowest rating)
  const groupedByTickerAndSorted = useMemo(() => {
    const groups: Record<string, typeof filteredContracts> = {};
    filteredContracts.forEach(c => {
      if (!groups[c.ticker]) {
        groups[c.ticker] = [];
      }
      groups[c.ticker].push(c);
    });

    // Sort contracts in each ticker group descending by health score (rating)
    Object.keys(groups).forEach(tk => {
      groups[tk].sort((a, b) => b.health - a.health);
    });

    return groups;
  }, [filteredContracts]);

  // Sort tickers: prioritize major indices SPX, NDX, QQQ, SPY, RUT
  const sortedTickers = useMemo(() => {
    return Object.keys(groupedByTickerAndSorted).sort((a, b) => {
      const priority: Record<string, number> = { 'SPX': 1, 'NDX': 2, 'QQQ': 3, 'SPY': 4, 'RUT': 5 };
      return (priority[a] || 99) - (priority[b] || 99);
    });
  }, [groupedByTickerAndSorted]);

  // Quick statistics for display
  const metricsOverview = useMemo(() => {
    const totalCount = contracts.length;
    const enterCount = contracts.filter(c => c.health >= 88).length;
    const extremeEV = contracts.filter(c => c.shelf === 'whale' || c.shelf === 'conviction').length;
    return {
      totalCount,
      enterCount,
      extremeEV
    };
  }, [contracts]);

  // Largest trades derived from the live tape (feedLogs) rather than hardcoded.
  // Premiums arrive as formatted strings ("$504,000") so we parse to compare.
  const topFlows = useMemo(() => {
    const parsePremium = (p: string) => Number(String(p).replace(/[^0-9.]/g, '')) || 0;
    let bullish: typeof feedLogs[number] | null = null;
    let hedge: typeof feedLogs[number] | null = null;
    for (const log of feedLogs) {
      if (log.tag === 'BULLISH') {
        if (!bullish || parsePremium(log.premium) > parsePremium(bullish.premium)) bullish = log;
      } else {
        if (!hedge || parsePremium(log.premium) > parsePremium(hedge.premium)) hedge = log;
      }
    }
    const largestOverall = feedLogs.reduce<typeof feedLogs[number] | null>((max, log) =>
      !max || parsePremium(log.premium) > parsePremium(max.premium) ? log : max, null);
    return { bullish, hedge, largestOverall };
  }, [feedLogs]);

  // Match corresponding AssetInfo object to trigger selection
  const handleSelectWithMatch = (ticker: string, strike: number, isCall: boolean) => {
    const asset = ASSET_LIST.find(a => a.ticker === ticker);
    if (asset) {
      onSelectContract(asset, strike, isCall);
    }
  };

  const currentManualText = SHELF_EXPLANATIONS[activeShelf];

  // Theme classes mapping — driven by design tokens so cards/wells render on the
  // real surface/border in BOTH light and dark (was hardcoded bg-black/border-black
  // in both modes, plus an invalid zinc-550).
  const c_bgMain = "bg-[var(--surface)]";
  const c_textColor = "text-[var(--text-primary)]";
  const c_cardBg = "bg-[var(--surface)] border-[var(--border)] shadow-sm text-[var(--text-primary)]";
  const c_cardBorder = "border-[var(--border)]";
  const c_textWhite = "text-[var(--text-primary)] font-black";
  const c_textMuted = "text-[var(--text-tertiary)] font-medium";
  const c_pillBg = "bg-[var(--surface-2)] border-[var(--border)]";
  const c_innerCardBg = "bg-[var(--surface-2)] border-[var(--border)]";
  const c_innerWellBg = "bg-[var(--surface)] border-[var(--border)]";
  const c_glassBg = "bg-[var(--surface)] border border-[var(--border)] shadow-md text-[var(--text-primary)]";

  // Ranked queue: the filtered setups flattened and sorted strongest-first, each enriched with
  // the row/inspector display fields. This is the core of the redesigned scanner.
  const rankedSetups = useMemo(
    () => [...filteredContracts]
      .sort((a, b) => b.health - a.health)
      .map(c => deriveSetup(c as ScannerContract)),
    [filteredContracts],
  );
  const selectedSetup = useMemo(
    () => rankedSetups.find(s => s.c.id === selectedSetupId) ?? rankedSetups[0] ?? null,
    [rankedSetups, selectedSetupId],
  );
  // "Review Setup" routes the contract into the SkyVision detail page (the confirm/prove/track flow).
  const reviewSetup = (s: { c: ScannerContract; side: 'C' | 'P' }) => {
    const asset = ASSET_LIST.find(a => a.ticker === s.c.ticker);
    if (asset) onSelectContract(asset, s.c.strike, s.side === 'C');
  };

  // Symbol group for the command header — the index/ETF universe the scanner covers.
  const SYMBOL_GROUP = ['SPX', 'NDX', 'QQQ', 'SPY', 'RUT'];
  const activeTicker = useContractStore.getState().selectedAsset.ticker;

  return (
    <div className={`w-full flex flex-col font-mono select-none antialiased space-y-6 max-w-6xl mx-auto pt-2 pb-12 ${c_textColor}`}>
      
      {/* 1. COMMAND HEADER — title · symbol group · data state · last updated · refresh */}
      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 sm:px-4 rounded-xl border ${c_cardBg}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Target className="w-4 h-4 text-[var(--success)] shrink-0" />
          <div className="min-w-0">
            <h1 className={`text-xs font-black tracking-widest uppercase ${c_textWhite} truncate`}>
              SkyVision <span className="text-[var(--text-tertiary)]">· Options Scanner</span>
            </h1>
            <p className="text-[9px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-widest truncate">
              {activeTicker} · 0DTE / 1D / 3D · Updated {formatTime(new Date(metricsAsOf))}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* symbol group */}
          <div className="flex items-center p-0.5 rounded-md border bg-[var(--surface-2)] border-[var(--border)]">
            {SYMBOL_GROUP.map(sym => {
              const asset = ASSET_LIST.find(a => a.ticker === sym);
              const on = activeTicker === sym;
              return (
                <button
                  key={sym}
                  onClick={() => asset && useContractStore.getState().setSelectedAsset(asset)}
                  aria-label={`Focus ${sym}`}
                  aria-pressed={on}
                  className={`px-2 py-1 text-[9px] font-black uppercase tracking-widest rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] ${
                    on ? 'bg-[var(--surface-3)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {sym}
                </button>
              );
            })}
          </div>
          <DataStateBadge state="sample" title="Demo data. Live scan requires a connected market feed." />
          {/* Scanner status — folded into the header so it no longer takes a full panel row. */}
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)]" title={lastScanMessage}>
            <span className={`w-1.5 h-1.5 rounded-full ${isMockScanning ? 'bg-[var(--warning)] animate-pulse' : 'bg-[var(--success)]'}`} aria-hidden="true" />
            {isMockScanning ? 'Scanning' : 'Ready'}
          </span>
          {/* Method — education on demand, out of the queue's vertical space. */}
          <button
            onClick={() => setIsStrategyExpanded(true)}
            aria-label="How this scan works"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
          >
            <Info className="w-3 h-3" />Method
          </button>
          <button
            onClick={triggerManualScannerRefresh}
            disabled={isMockScanning}
            aria-label="Refresh scan"
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] ${
              isMockScanning ? 'bg-[var(--surface-2)] text-[var(--text-tertiary)] border-[var(--border)]' : 'bg-[var(--surface-2)] text-[var(--text-primary)] border-[var(--border-strong)] hover:bg-[var(--surface-3)]'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${isMockScanning ? 'animate-spin text-[var(--success)]' : ''}`} />
            {isMockScanning ? 'Scanning…' : 'Refresh scan'}
          </button>
        </div>
      </div>

      {/* 2. CONTROLS BAR (Segmented Selection, Filters, Search) */}
      <div className={`grid grid-cols-1 md:grid-cols-12 gap-3 items-center rounded-lg border ${c_glassBg}`}>
        
        {/* Navigation Categories Tabs */}
        <div className="md:col-span-8 flex items-center p-0.5 border rounded-md overflow-x-auto scrollbar-none gap-0.5 bg-[var(--surface-2)] border-[var(--border)]">
          {[
            { id: 'conviction', label: 'Top Setups', count: contracts.filter(c => c.shelf === 'conviction').length },
            { id: 'improved', label: 'Quick Scalp', count: contracts.filter(c => c.shelf === 'improved').length },
            { id: 'mispriced', label: 'DISCOUNTED', count: contracts.filter(c => c.shelf === 'mispriced').length },
            { id: 'invalidation', label: 'REBOUNDS', count: contracts.filter(c => c.shelf === 'invalidation').length },
            { id: 'whale', label: 'WHALE SWEEPS', count: contracts.filter(c => c.shelf === 'whale').length },
            { id: 'all', label: 'ALL', count: contracts.length }
          ].map(shelf => (
            <button
              key={shelf.id}
              onClick={() => setActiveShelf(shelf.id as any)}
              className={`px-3 py-1.5 text-[9.5px] uppercase font-black tracking-wider rounded transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeShelf === shelf.id
                  ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>{shelf.label}</span>
              <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${activeShelf === shelf.id ? 'bg-[var(--surface)] text-[var(--text-secondary)]' : 'bg-[var(--surface)] text-[var(--text-tertiary)]'}`}>
                {shelf.count}
              </span>
            </button>
          ))}
        </div>

        {/* Option Call/Put Type Filter */}
         <div className="md:col-span-2 flex justify-center p-0.5 border rounded-md bg-[var(--surface-2)] border-[var(--border)]">
          {[
            { id: 'all', label: 'ALL' },
            { id: 'calls', label: 'C' },
            { id: 'puts', label: 'P' }
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setOptionTypeFilter(opt.id as any)}
              className={`px-3.5 py-1.5 text-[8.5px] uppercase font-extrabold rounded flex-1 transition-colors cursor-pointer ${
                optionTypeFilter === opt.id
                  ? 'bg-[var(--info)]/15 text-[var(--info)] border border-[var(--info)]/30'
                  : 'text-[var(--text-tertiary)] border border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Ticker / strike search box */}
        <div className="md:col-span-2 relative" ref={searchContainerRef}>
          <SearchInput
            ariaLabel="Filter by ticker or strike"
            value={searchQuery}
            onChange={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onClear={() => { setSearchQuery(''); setIsSearchFocused(false); }}
            placeholder="Filter by ticker or strike…"
            uppercase
            size="sm"
            inputClassName="text-[9.5px] font-black"
            rightSlot={searchQuery.length === 0 ? (
              <kbd className="hidden sm:inline-block bg-[var(--surface-2)] text-[var(--text-tertiary)] border border-[var(--border)] px-1 py-[1.5px] rounded-xs font-mono text-[7px] select-none">TXT</kbd>
            ) : undefined}
          />

          {/* Dynamic Search Combobox results list overlay */}
          <AnimatePresence>
            {isSearchFocused && (
              <motion.div
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 3 }}
                className={`absolute right-0 top-full mt-2 w-[300px] max-w-[calc(100vw-24px)] border shadow-2xl rounded-lg overflow-hidden z-50 text-left font-mono ${
                  isLight ? 'bg-white border-[var(--border)] text-zinc-800' : 'bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-secondary)]'
                }`}
              >
                {/* 1. SECTION: MAIN INDEXES */}
                <div className={`px-2.5 py-1 text-[7.5px] font-extrabold uppercase tracking-widest border-b ${
                  isLight ? 'bg-[var(--surface-2)] text-[var(--text-tertiary)] border-[var(--border)]' : 'bg-[var(--surface-2)]/40 text-[var(--text-tertiary)] border-[var(--border)]'
                }`}>
                  Switch Active Index Ticker
                </div>
                {filteredSearchAssets.length === 0 ? (
                  <div className="px-3.5 py-2 text-[8px] text-[var(--text-tertiary)] uppercase">No active assets found</div>
                ) : (
                  filteredSearchAssets.map(a => (
                    <button
                      key={a.ticker}
                      onClick={() => {
                        useContractStore.getState().setSelectedAsset(a);
                        setIsSearchFocused(false);
                        setSearchQuery('');
                      }}
                      className={`w-full text-left px-3.5 py-1.5 transition-all flex justify-between items-center border-b ${
                        isLight ? 'hover:bg-[var(--surface-2)] border-[var(--border)]' : 'hover:bg-[var(--surface-3)] border-[var(--border)]'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-[9.5px] font-black ${isLight ? 'text-zinc-900' : 'text-zinc-150'}`}>{a.ticker}</span>
                        <span className="text-[7.5px] text-[var(--text-tertiary)] font-sans uppercase font-bold">{a.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-bold block">${a.defaultPrice.toFixed(2)}</span>
                        <span className="text-[7.5px] font-bold text-[var(--success)]">+{a.volatility.toFixed(1)}% VOL</span>
                      </div>
                    </button>
                  ))
                )}

                {/* 2. SECTION: OPTIONS & TRANSITIONS */}
                <div className={`px-2.5 py-1 text-[7.5px] font-extrabold uppercase tracking-widest border-b ${
                  isLight ? 'bg-[var(--surface-2)] text-[var(--text-tertiary)] border-[var(--border)]' : 'bg-[var(--surface-2)]/40 text-[var(--text-tertiary)] border-[var(--border)]'
                }`}>
                  Launch Option chain / Assessments
                </div>
                <div className="max-h-[160px] overflow-y-auto">
                  {filteredSearchContracts.length === 0 ? (
                    <div className="px-3.5 py-2 text-[8px] text-[var(--text-tertiary)] uppercase">No options matched</div>
                  ) : (
                    filteredSearchContracts.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          const asset = ASSET_LIST.find(a => a.ticker === c.ticker);
                          if (asset) {
                            useContractStore.getState().selectContractAtomically(asset, c.strike, c.isCall);
                          }
                          setIsSearchFocused(false);
                          setSearchQuery('');
                        }}
                        className={`w-full text-left px-3.5 py-2 transition-all border-b last:border-none flex flex-col ${
                          isLight ? 'hover:bg-[var(--surface-2)] border-[var(--border)]' : 'hover:bg-[var(--surface-3)] border-[var(--border)]'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className={`text-[9.5px] font-black ${c.isCall ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                            {c.ticker} {fmtNum(c.strike)}{c.isCall ? 'C' : 'P'}
                          </span>
                          <span className={`text-[7.5px] font-bold px-1 py-0.5 rounded border ${
                            c.isCall
                              ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20'
                              : 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20'
                          }`}>
                            {c.shelf.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-[8px] text-[var(--text-tertiary)] font-sans font-semibold uppercase truncate">{c.narrative}</span>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* Method modal — the "How this category works" education, on demand via the header
          Method button, so it never occupies vertical space above the setup queue. */}
      <AnimatePresence>
        {isStrategyExpanded && (
          <motion.div
            className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="How this scan category works"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsStrategyExpanded(false)} />
            <motion.div
              initial={{ scale: 0.97, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl text-left"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Info className="w-4 h-4 text-[var(--info)] shrink-0" />
                  <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-primary)] truncate">Method · {currentManualText.title}</span>
                </div>
                <button onClick={() => setIsStrategyExpanded(false)} aria-label="Close" className="shrink-0 rounded p-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 leading-relaxed font-sans text-[12px] text-[var(--text-secondary)] font-medium">
                {currentManualText.whyItsBest}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
                  <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">Horizon</span>
                  <span className={`block text-[10px] font-mono font-bold ${c_textWhite}`}>{currentManualText.horizon}</span>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
                  <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">Signal</span>
                  <span className="block text-[9px] font-mono font-bold text-[var(--info)] uppercase leading-tight">{currentManualText.mathTracking}</span>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
                  <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">Confidence</span>
                  <span className="block text-[9px] font-mono font-bold text-[var(--success)] leading-tight">{currentManualText.confidenceTier}</span>
                </div>
              </div>
              <p className="mt-3 border-t border-[var(--border)] pt-2 text-[9px] text-[var(--text-tertiary)] uppercase tracking-widest">Sample data — illustrative, not a live scan.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. MAIN SETUP QUEUE + SELECTED-SETUP INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">

        {/* LEFT: ranked setup queue — larger horizontal rows, strongest elevated */}
        <div className="lg:col-span-8 flex flex-col gap-3 w-full">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
              {rankedSetups.length} {rankedSetups.length === 1 ? 'setup' : 'setups'} · strongest first
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Sample model ranking</span>
          </div>

          {rankedSetups.length === 0 ? (
            <div className="border p-8 rounded-xl text-center uppercase text-xs space-y-2 bg-[var(--surface)] border-[var(--border)]">
              <ShieldAlert className="w-8 h-8 text-[var(--text-tertiary)] mx-auto" />
              <p className={`font-extrabold tracking-widest text-[10px] ${c_textWhite}`}>No setups match your filters.</p>
              <p className="text-[9px] text-[var(--text-tertiary)] leading-snug font-sans">Try clearing the filters or modifying your search terms above.</p>
              <button
                type="button"
                onClick={() => { setActiveShelf('all'); setOptionTypeFilter('all'); setSearchQuery(''); }}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border font-mono text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer bg-transparent border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--success)] hover:text-[var(--success)]"
              >
                <RefreshCw className="w-3 h-3" />
                Clear filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {rankedSetups.map((s, i) => (
                <SetupRow
                  key={s.c.id}
                  s={s}
                  selected={selectedSetup?.c.id === s.c.id}
                  elevated={i === 0}
                  onSelect={() => setSelectedSetupId(s.c.id)}
                  onReview={() => reviewSetup(s)}
                />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: selected-setup inspector */}
        <div className="lg:col-span-4 w-full">
          <SetupInspector s={selectedSetup} onReview={reviewSetup} />
        </div>

      </div>

      {/* 4. SUPPORTING MARKET CONTEXT — secondary evidence, collapsed by default so it never
          competes with the setup queue. */}
      <div className={`w-full rounded-xl border ${c_cardBg}`}>
        <button
          type="button"
          onClick={() => setIsSupportingOpen(v => !v)}
          aria-expanded={isSupportingOpen}
          className="w-full flex items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[var(--danger)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">Supporting evidence</span>
            <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Largest trades · Sample flow</span>
          </div>
          {isSupportingOpen ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />}
        </button>

        <AnimatePresence initial={false}>
          {isSupportingOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 pt-0">

                {/* Largest trades (derived from the sample tape) */}
                <div className="border rounded-xl p-3 sm:p-4 text-left flex flex-col gap-3 bg-[var(--surface-2)] border-[var(--border)]">
                  <div className="flex items-center gap-2 border-b pb-2 border-[var(--border)]">
                    <Flame className="w-3.5 h-3.5 text-[var(--danger)]" />
                    <h2 className={`text-[10px] font-black uppercase tracking-widest ${c_textWhite}`}>Largest Trades</h2>
                  </div>
                  <div className="space-y-2.5">
                    <div className="border p-2.5 rounded-lg flex justify-between items-center text-[10px] bg-[var(--surface)] border-[var(--border)]">
                      {topFlows.bullish ? (
                        <>
                          <div className="space-y-0.5">
                            <span className="text-[7.5px] uppercase block font-black text-[var(--text-tertiary)]">Largest Bullish</span>
                            <span className="text-[var(--success)] font-bold block">{topFlows.bullish.ticker} {fmtNum(topFlows.bullish.strike)}{topFlows.bullish.type}</span>
                            <span className="text-[8px] font-sans uppercase text-[var(--text-secondary)]">{topFlows.bullish.size}</span>
                          </div>
                          <div className="text-right space-y-0.5">
                            <span className="text-[7.5px] block uppercase font-bold text-[var(--text-tertiary)]">Premium</span>
                            <span className={`block font-black font-mono ${c_textWhite}`}>{topFlows.bullish.premium}</span>
                          </div>
                        </>
                      ) : (<span className="text-[9px] text-[var(--text-tertiary)] italic">Awaiting bullish flow…</span>)}
                    </div>
                    <div className="border p-2.5 rounded-lg flex justify-between items-center text-[10px] bg-[var(--surface)] border-[var(--border)]">
                      {topFlows.hedge ? (
                        <>
                          <div className="space-y-0.5">
                            <span className="text-[7.5px] uppercase block font-black text-[var(--text-tertiary)]">Largest Hedge</span>
                            <span className="text-[var(--danger)] font-bold block">{topFlows.hedge.ticker} {fmtNum(topFlows.hedge.strike)}{topFlows.hedge.type}</span>
                            <span className="text-[8px] font-sans uppercase text-[var(--text-secondary)]">{topFlows.hedge.size}</span>
                          </div>
                          <div className="text-right space-y-0.5">
                            <span className="text-[7.5px] block uppercase font-bold text-[var(--text-tertiary)]">Premium</span>
                            <span className={`block font-black font-mono ${c_textWhite}`}>{topFlows.hedge.premium}</span>
                          </div>
                        </>
                      ) : (<span className="text-[9px] text-[var(--text-tertiary)] italic">Awaiting hedge flow…</span>)}
                    </div>
                    <div className="border p-2.5 rounded-lg flex justify-between items-center text-[10px] bg-[var(--surface)] border-[var(--border)]">
                      {topFlows.largestOverall ? (
                        <>
                          <div className="space-y-0.5">
                            <span className="text-[7.5px] uppercase block font-black text-[var(--text-tertiary)]">Largest Overall</span>
                            <span className="text-[var(--info)] font-bold block">{topFlows.largestOverall.ticker} {fmtNum(topFlows.largestOverall.strike)}{topFlows.largestOverall.type}</span>
                            <span className="text-[8px] font-sans uppercase text-[var(--text-secondary)]">{topFlows.largestOverall.side}</span>
                          </div>
                          <div className="text-right space-y-0.5">
                            <span className="text-[7.5px] block uppercase font-bold text-[var(--text-tertiary)]">Premium</span>
                            <span className={`block font-black font-mono ${c_textWhite}`}>{topFlows.largestOverall.premium}</span>
                          </div>
                        </>
                      ) : (<span className="text-[9px] text-[var(--text-tertiary)] italic">Awaiting flow…</span>)}
                    </div>
                  </div>
                </div>

                {/* Sample option flow tape */}
                <div className="border rounded-xl p-3 sm:p-4 text-left flex flex-col gap-3 bg-[var(--surface-2)] border-[var(--border)]">
                  <div className="flex items-center justify-between border-b pb-2 border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-[var(--info)]" />
                      <h2 className={`text-[10px] font-black uppercase tracking-widest ${c_textWhite}`}>Sample Option Flow</h2>
                    </div>
                    {feedError && (
                      <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/30" role="status" aria-live="polite">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
                        Reconnecting…
                      </span>
                    )}
                  </div>
                  <div className="h-[260px] overflow-y-auto scrollbar-thin pr-1 select-none flex flex-col gap-1.5">
                    <AnimatePresence initial={false}>
                      {feedLogs.map((log, index) => {
                        const isSweep = log.side === 'Sweep';
                        const isBullish = log.tag === 'BULLISH';
                        return (
                          <motion.div
                            key={(log as any).id ?? `${log.timestamp}-${log.ticker}-${log.strike}-${index}`}
                            initial={{ opacity: 0, x: 20, height: 0 }}
                            animate={{ opacity: 1, x: 0, height: 'auto' }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="py-2.5 border rounded-lg px-2.5 transition-colors flex flex-col gap-1 text-[9.5px] bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-3)]"
                          >
                            <div className="flex justify-between items-center text-[9px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-[var(--text-tertiary)]">{log.timestamp}</span>
                                <span className={`px-1 py-0.5 rounded font-black text-[7.5px] ${isSweep ? 'bg-[var(--warning)]/10 border border-[var(--warning)]/25 text-[var(--warning)]' : 'bg-[var(--info)]/10 border border-[var(--info)]/25 text-[var(--info)]'}`}>
                                  {log.side.toUpperCase()}
                                </span>
                              </div>
                              <span className={`font-mono font-extrabold flex items-center gap-1 ${isBullish ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                                <span aria-hidden="true">{isBullish ? '▲' : '▼'}</span>
                                {log.action}
                              </span>
                            </div>
                            <div className="flex justify-between items-baseline font-mono font-bold">
                              <span className={`text-[10.5px] ${c_textWhite}`}>{log.ticker} {fmtNum(log.strike)}{log.type}</span>
                              <span className={isBullish ? 'text-[var(--success)]' : 'text-[var(--warning)]'}><span aria-hidden="true">{isBullish ? '+' : '−'}</span>{log.premium}</span>
                            </div>
                            <div className="flex justify-between items-center text-[8.5px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border)]">
                              <span>Size {log.size}</span>
                              <span>Bias <span className={isBullish ? 'text-[var(--success)] font-bold' : 'text-[var(--text-secondary)] font-bold'}>{log.tag}</span></span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
