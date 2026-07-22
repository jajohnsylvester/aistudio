'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense, Fragment, type DragEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getStrategyAssignments, addStrategyAssignment, deleteStrategyAssignment,
  updateStrategyAssignment, renameStrategy, deleteStrategy,
  type StrategyAssignment,
} from '@/lib/sheets';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, RefreshCw, Wallet, TrendingUp, TrendingDown,
  AlertCircle, CheckCircle, Lightbulb, ExternalLink, Key,
  Shield, RefreshCcw, Server, Bot, Database, Zap, Clock, Laptop, Fingerprint, Timer, Play, PieChart, ChevronDown, ChevronUp,
  Layers, Plus, X, Activity, Pencil, Trash2, Check, SplitSquareHorizontal
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface JwtMetadata {
  rawIat: number | null;
  rawExp: number | null;
  iatStr: string | null;
  expStr: string | null;
}

interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema?: any;
}

interface MCPStatus {
  connected: boolean;
  hasAccessToken: boolean;
  tokenExpired?: boolean;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  geminiKeyConfigured?: boolean;
  proxyConfigured?: boolean;
  serverTimestamp?: string;
  jwtMeta?: JwtMetadata | null;
  tools?: MCPToolInfo[];
  refreshIntervalSeconds?: number;
}

interface Holding {
  trading_symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
  pnl_percent: number;
  current_value: number;
  investment_value: number;
  sector: string;
  // Computed server-side (in the API route) against the live Strategy
  // sheet as soon as the Paytm response comes in. Optional so the client
  // still works, via the fallback logic below, against an older/cached
  // response that predates this enrichment.
  display_symbol?: string;
  is_synthetic_symbol?: boolean;
  is_new_holding?: boolean;
  // Full/company name of the asset (e.g. "Infosys Limited"), resolved
  // server-side. Used for the hover tooltip and the asset-name filter.
  // Optional for the same "older cached response" reason as above.
  name?: string;
}

interface SectorBreakdownEntry {
  sector: string;
  currentValue: number;
  investmentValue: number;
  pnl: number;
  percent: number;
}

interface PortfolioData {
  totalInvestment: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdings: Holding[];
  insights: string;
  agentModel?: string;
  source?: string;
  lastUpdated: string;
  paytmApiTimestamp?: string;
  jwtMeta?: JwtMetadata | null;
  sectorBreakdown?: SectorBreakdownEntry[];
  newHoldingsCount?: number;
}

interface DragPayload {
  symbol: string;
  assignmentId: string | null;
  sourceStrategy: string | null;
}

// A holding as it appears in the UI once we've resolved its identity: every
// holding needs a stable, unique, human-readable symbol to key off of for
// drag & drop, strategy assignment, and "is this new" checks. Paytm returns
// "NA" (or blank) as trading_symbol for several instrument types — mostly
// bonds — so several holdings can share the literal string "NA". Using that
// raw value as an identity key is what caused the Unassigned pool to fill up
// with indistinguishable "NA" chips (see assignDisplaySymbols below).
interface HoldingWithStrategy extends Holding {
  displaySymbol: string;
  isSyntheticSymbol: boolean;
  // quantity undefined on an assignment means "the whole holding" (either a
  // legacy row, or a holding that hasn't been split across strategies).
  strategyAssignments: { id: string; strategy: string; quantity?: number }[];
  assignedQuantity: number;
  remainingQuantity: number;
}

const SECTOR_COLORS = ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];
const STRATEGY_COLORS = ['#2563EB', '#059669', '#F59E0B', '#7C3AED', '#DC2626', '#0891B2', '#DB2777', '#65A30D'];
const UNASSIGNED_COLOR = '#94A3B8';
const NEW_HOLDING_COLOR = '#D97706';
const UNASSIGNED_FILTER_VALUE = '__unassigned__';
// Distinct from UNASSIGNED_FILTER_VALUE (zero assignments): this one also
// catches holdings that have been split but still have leftover quantity
// that hasn't been allocated to any strategy yet.
const REMAINING_FILTER_VALUE = '__remaining__';
// localStorage key used to remember which holding's split editor was open,
// so it survives a page refresh.
const SPLIT_EDITOR_STORAGE_KEY = 'paytm-portfolio-split-editor-symbol';

function getStrategyColor(strategy: string, strategies: string[]): string {
  const idx = strategies.indexOf(strategy);
  return STRATEGY_COLORS[(idx >= 0 ? idx : 0) % STRATEGY_COLORS.length];
}

// Builds a single tooltip listing every strategy an asset's quantity has
// been split across (plus any leftover unassigned amount), so hovering on
// the asset anywhere in the Strategy Allocation section — not just its chip
// in one particular strategy — shows the full picture. Returns undefined
// when the holding isn't actually split (nothing to add beyond the normal
// name/symbol tooltip), so callers can fall back to their existing title.
function getSplitBreakdownTooltip(h: HoldingWithStrategy): string | undefined {
  const isSplit = h.strategyAssignments.length > 1 || (h.strategyAssignments.length >= 1 && h.remainingQuantity > 0);
  if (!isSplit) return undefined;

  const parts = h.strategyAssignments.map((sa) => {
    const qty = typeof sa.quantity === 'number' ? sa.quantity : h.quantity;
    return `${qty} → ${sa.strategy}`;
  });
  if (h.remainingQuantity > 0) {
    parts.push(`${h.remainingQuantity} → Unassigned`);
  }

  const namePart = h.name && h.name !== h.displaySymbol ? ` (${h.name})` : '';
  return `${h.displaySymbol}${namePart} — ${h.quantity} total split as: ${parts.join(', ')}`;
}

function formatINR(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --- Synthetic symbol assignment for symbol-less holdings (e.g. bonds) ---
//
// Paytm Money's API reports trading_symbol as "NA" (sometimes blank/"-")
// for instruments that don't trade under a ticker, chiefly bonds. Treating
// that literal string as the holding's identity broke two things at once:
// every "NA" holding collapsed onto the same React key / map entry, and
// assigning ONE of them to a strategy silently "assigned" all of them,
// while the rest kept re-appearing in Unassigned as duplicate "NA" chips.
//
// The fix: give every symbol-less holding a stable, unique display name
// (Bond1, Bond2, Bond3, ... — or "<Sector>1" for other symbol-less sectors)
// and use THAT for every identity-sensitive operation (keys, drag payloads,
// Strategy-sheet lookups). Numbering is derived from a deterministic sort
// (avg price, then quantity, then invested value) rather than array index,
// so the same underlying bond gets the same synthetic name across refetches
// even if Paytm returns holdings in a different order next time.
function isMissingSymbol(symbol: string | null | undefined): boolean {
  if (!symbol) return true;
  const s = symbol.trim().toUpperCase();
  return s === '' || s === 'NA' || s === 'N/A' || s === '-' || s === 'NULL';
}

function syntheticPrefix(sector: string | null | undefined): string {
  const word = (sector || '').trim().split(/\s+/)[0] || 'Asset';
  // Very small heuristic to singularize "Bonds" -> "Bond" etc.
  return word.length > 3 && word.toLowerCase().endsWith('s') ? word.slice(0, -1) : word;
}

function assignDisplaySymbols(holdings: Holding[]): { displaySymbol: string; isSynthetic: boolean }[] {
  const groups = new Map<string, number[]>();
  holdings.forEach((h, idx) => {
    if (isMissingSymbol(h.trading_symbol)) {
      const key = syntheticPrefix(h.sector);
      const list = groups.get(key) || [];
      list.push(idx);
      groups.set(key, list);
    }
  });

  const result = holdings.map((h) => ({ displaySymbol: h.trading_symbol, isSynthetic: false }));

  groups.forEach((indices, prefix) => {
    const sorted = [...indices].sort((a, b) => {
      const ha = holdings[a], hb = holdings[b];
      if (ha.average_price !== hb.average_price) return ha.average_price - hb.average_price;
      if (ha.quantity !== hb.quantity) return ha.quantity - hb.quantity;
      return ha.investment_value - hb.investment_value;
    });
    sorted.forEach((idx, i) => {
      result[idx] = { displaySymbol: `${prefix}${i + 1}`, isSynthetic: true };
    });
  });

  return result;
}

function SectorDiversificationChart({ data }: { data: SectorBreakdownEntry[] }) {
  const size = 180;
  const radius = 70;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;
  let cumulativePercent = 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F1F5F9" strokeWidth={strokeWidth} />
          {data.map((entry, idx) => {
            const dash = (entry.percent / 100) * circumference;
            const gap = circumference - dash;
            const offset = -((cumulativePercent / 100) * circumference);
            cumulativePercent += entry.percent;
            return (
              <circle
                key={entry.sector}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={SECTOR_COLORS[idx % SECTOR_COLORS.length]}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-semibold text-slate-500 tracking-wide">SECTORS</span>
          <span className="text-2xl font-bold text-slate-800">{data.length}</span>
        </div>
      </div>
    </div>
  );
}

function StatusIndicator({ ok, label, subtext }: { ok: boolean | undefined; label: string; subtext: string }) {
  return (
    <div className="flex items-center gap-3">
      {ok ? <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />}
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className={`text-xs mt-0.5 ${ok ? 'text-green-600' : 'text-destructive'}`}>{subtext}</p>
      </div>
    </div>
  );
}

function CollapseToggle({ isOpen, onToggle, label }: { isOpen: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
      aria-expanded={isOpen}
      className="p-1.5 rounded-md hover:bg-black/5 text-slate-500 flex-shrink-0 transition-colors"
    >
      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  );
}

function PaytmPortfolioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestToken = searchParams.get('request_token');

  const [status, setStatus] = useState<MCPStatus | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  const [clientTime, setClientTime] = useState<string>('');

  const [refreshInterval, setRefreshInterval] = useState<number>(300);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState<boolean>(true);
  const [secondsUntilNextRefresh, setSecondsUntilNextRefresh] = useState<number>(300);

  const [selectedTool, setSelectedTool] = useState<string>('');
  const [toolArguments, setToolArguments] = useState<string>('{}');
  const [mcpResult, setMcpResult] = useState<any>(null);
  const [isExecutingTool, setIsExecutingTool] = useState<boolean>(false);

  // Only three collapsible states remain: Holdings/Sector default open (now
  // up top), Strategy Allocation default open (right below Holdings), and a
  // single Diagnostics group (clocks + JWT + Connection Status + MCP Tools)
  // that is collapsed by default and lives at the bottom of the page.
  const [isHoldingsSectionOpen, setIsHoldingsSectionOpen] = useState<boolean>(true);
  const [isSectorSectionOpen, setIsSectorSectionOpen] = useState<boolean>(true);
  const [isStrategySectionOpen, setIsStrategySectionOpen] = useState<boolean>(true);
  const [isDiagnosticsSectionOpen, setIsDiagnosticsSectionOpen] = useState<boolean>(false);

  const [assignments, setAssignments] = useState<StrategyAssignment[]>([]);
  const [isLoadingStrategies, setIsLoadingStrategies] = useState<boolean>(false);
  const [isSavingStrategy, setIsSavingStrategy] = useState<boolean>(false);
  const [newStrategyName, setNewStrategyName] = useState<string>('');
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null); // '' = Unassigned pool, else strategy name

  // Rename-in-place for a strategy (edit icon on its card header)
  const [editingStrategyName, setEditingStrategyName] = useState<string | null>(null);
  const [editingStrategyValue, setEditingStrategyValue] = useState<string>('');

  // Split-a-holding-across-strategies editor, keyed by the holding's
  // displaySymbol. Values are the raw text of each strategy's quantity
  // input so the user can clear a field while typing.
  const [splitEditorSymbol, setSplitEditorSymbol] = useState<string | null>(null);
  const [splitAllocations, setSplitAllocations] = useState<Record<string, string>>({});
  const [isSavingSplit, setIsSavingSplit] = useState<boolean>(false);
  const hasRestoredSplitEditor = useRef(false);

  // Asset Holdings Detail filters
  const [filterSymbol, setFilterSymbol] = useState<string>('');
  const [filterSector, setFilterSector] = useState<string>('');
  const [filterStrategy, setFilterStrategy] = useState<string>('');

  const { toast } = useToast();

  useEffect(() => {
    setClientTime(new Date().toLocaleString());
    const timer = setInterval(() => setClientTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(timer);
  }, []);

  const checkStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const response = await fetch('/api/paytm-portfolio?action=status', { credentials: 'include' });
      const statusData: MCPStatus = await response.json();
      setStatus(statusData);

      if (statusData.refreshIntervalSeconds) {
        setRefreshInterval(statusData.refreshIntervalSeconds);
        setSecondsUntilNextRefresh(statusData.refreshIntervalSeconds);
      }
      if (statusData.tools && statusData.tools.length > 0 && !selectedTool) {
        setSelectedTool(statusData.tools[0].name);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Status check failed.' });
    } finally {
      setIsLoadingStatus(false);
    }
  }, [selectedTool, toast]);

  const fetchPortfolio = useCallback(async () => {
    setIsLoadingPortfolio(true);
    setPortfolioError(null);
    try {
      const response = await fetch('/api/paytm-portfolio?action=portfolio', { credentials: 'include' });
      const data = await response.json();
      if (data.error) {
        setPortfolioError(data.error);
        setPortfolio(null);

        if (data.tokenExpired || data.oauthRequired) {
          await fetch('/api/paytm-portfolio?action=clear_token', { credentials: 'include' });
          setStatus(prev => prev ? { ...prev, hasAccessToken: false, tokenExpired: true } : prev);
        }
      } else {
        setPortfolio(data);
        setSecondsUntilNextRefresh(refreshInterval);
      }
    } catch (error: any) {
      setPortfolioError(error.message);
    } finally {
      setIsLoadingPortfolio(false);
    }
  }, [refreshInterval]);

  // Strategy allocation is persisted directly via the '@/lib/sheets' server
  // actions (same pattern as ScratchNotes) rather than a REST API route.
  const fetchStrategyAssignments = useCallback(async () => {
    setIsLoadingStrategies(true);
    try {
      const data = await getStrategyAssignments();
      setAssignments(data);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to load saved strategies', description: error.message });
    } finally {
      setIsLoadingStrategies(false);
    }
  }, [toast]);

  // --- Derived strategy data (declared before the handlers that close over them) ---

  const strategies = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((a) => { if (a.strategy) set.add(a.strategy); });
    return Array.from(set);
  }, [assignments]);

  const symbolAssignmentsMap = useMemo(() => {
    const map = new Map<string, { id: string; strategy: string; quantity?: number }[]>();
    assignments.forEach((a) => {
      if (!a.symbol) return; // strategy-only definition row, not a holding assignment
      const list = map.get(a.symbol) || [];
      list.push({ id: a.id, strategy: a.strategy, quantity: a.quantity });
      map.set(a.symbol, list);
    });
    return map;
  }, [assignments]);

  // trading_symbol is "NA"/blank for several instrument types (chiefly
  // bonds), so identity for drag & drop / strategy lookups is resolved
  // through a synthetic, stable displaySymbol instead of the raw field —
  // see assignDisplaySymbols for why this matters.
  const holdingsWithStrategy = useMemo<HoldingWithStrategy[]>(() => {
    if (!portfolio) return [];
    // The API route now resolves display_symbol/is_synthetic_symbol itself
    // (checked against the live Strategy sheet at fetch time). This local
    // fallback only kicks in for a response that predates that change.
    const fallbackResolved = assignDisplaySymbols(portfolio.holdings);
    return portfolio.holdings.map((h, idx) => {
      const displaySymbol = h.display_symbol ?? fallbackResolved[idx].displaySymbol;
      const isSyntheticSymbol = h.is_synthetic_symbol ?? fallbackResolved[idx].isSynthetic;
      const strategyAssignments = symbolAssignmentsMap.get(displaySymbol) || [];
      // An assignment with no quantity of its own claims the whole holding
      // (legacy rows, and rows that haven't been split).
      const assignedQuantity = strategyAssignments.reduce(
        (sum, sa) => sum + (typeof sa.quantity === 'number' ? sa.quantity : h.quantity),
        0
      );
      const remainingQuantity = Math.max(0, h.quantity - assignedQuantity);
      return {
        ...h,
        displaySymbol,
        isSyntheticSymbol,
        strategyAssignments,
        assignedQuantity,
        remainingQuantity,
      };
    });
  }, [portfolio, symbolAssignmentsMap]);

  // A holding belongs in the Unassigned pool as long as some of its
  // quantity hasn't been claimed by any strategy yet — including a holding
  // that's been split and still has a leftover, unassigned remainder.
  const unassignedHoldings = useMemo(
    () => holdingsWithStrategy.filter((h) => h.remainingQuantity > 0),
    [holdingsWithStrategy]
  );

  // "New" is decided primarily by the API route, which checks each display
  // symbol against the Strategy sheet the moment the Paytm response comes
  // in. We still cross-check against the client's own live copy of the
  // sheet (knownSymbolsFromSheet) so the "NEW" badge disappears the instant
  // the user drags a holding into a strategy during this session, instead
  // of waiting for the next portfolio refetch.
  const knownSymbolsFromSheet = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((a) => { if (a.symbol) set.add(a.symbol); });
    return set;
  }, [assignments]);

  const newlyDiscoveredSymbols = useMemo(() => {
    const set = new Set<string>();
    holdingsWithStrategy.forEach((h) => {
      const flaggedNewByServer = h.is_new_holding ?? true;
      if (flaggedNewByServer && !knownSymbolsFromSheet.has(h.displaySymbol)) set.add(h.displaySymbol);
    });
    return set;
  }, [holdingsWithStrategy, knownSymbolsFromSheet]);

  const unassignedSummary = useMemo(() => {
    const investmentValue = unassignedHoldings.reduce((s, h) => s + h.investment_value, 0);
    const currentValue = unassignedHoldings.reduce((s, h) => s + h.current_value, 0);
    const pnl = unassignedHoldings.reduce((s, h) => s + h.pnl, 0);
    return { currentValue, pnl, pnlPercent: investmentValue > 0 ? (pnl / investmentValue) * 100 : 0 };
  }, [unassignedHoldings]);

  const strategySummaries = useMemo(() => {
    return strategies.map((name) => {
      const holdingsInStrategy = holdingsWithStrategy.filter((h) => h.strategyAssignments.some((sa) => sa.strategy === name));
      // A split holding only contributes the slice of its value that's
      // actually allocated to this strategy (quantity / total quantity);
      // an unsplit assignment (quantity undefined) contributes the whole
      // holding, matching pre-split behavior.
      let investmentValue = 0, currentValue = 0, pnl = 0;
      holdingsInStrategy.forEach((h) => {
        const sa = h.strategyAssignments.find((a) => a.strategy === name)!;
        const fraction = typeof sa.quantity === 'number' && h.quantity > 0 ? sa.quantity / h.quantity : 1;
        investmentValue += h.investment_value * fraction;
        currentValue += h.current_value * fraction;
        pnl += h.pnl * fraction;
      });
      return {
        strategy: name,
        holdings: holdingsInStrategy,
        investmentValue,
        currentValue,
        pnl,
        pnlPercent: investmentValue > 0 ? (pnl / investmentValue) * 100 : 0,
      };
    });
  }, [strategies, holdingsWithStrategy]);

  // Asset Holdings Detail filters (symbol substring, sector, strategy)
  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    holdingsWithStrategy.forEach((h) => { if (h.sector) set.add(h.sector); });
    return Array.from(set).sort();
  }, [holdingsWithStrategy]);

  const filteredHoldings = useMemo(() => {
    const symbolQuery = filterSymbol.trim().toLowerCase();
    return holdingsWithStrategy.filter((h) => {
      if (
        symbolQuery &&
        !h.displaySymbol.toLowerCase().includes(symbolQuery) &&
        !h.trading_symbol.toLowerCase().includes(symbolQuery) &&
        !(h.name || '').toLowerCase().includes(symbolQuery)
      ) {
        return false;
      }
      if (filterSector && h.sector !== filterSector) return false;
      if (filterStrategy === UNASSIGNED_FILTER_VALUE) {
        if (h.strategyAssignments.length > 0) return false;
      } else if (filterStrategy === REMAINING_FILTER_VALUE) {
        if (h.remainingQuantity <= 0) return false;
      } else if (filterStrategy) {
        if (!h.strategyAssignments.some((sa) => sa.strategy === filterStrategy)) return false;
      }
      return true;
    });
  }, [holdingsWithStrategy, filterSymbol, filterSector, filterStrategy]);

  // --- Strategy allocation handlers ---

  const handleAddStrategy = useCallback(async () => {
    const name = newStrategyName.trim();
    if (!name) return;
    if (strategies.some((s) => s.toLowerCase() === name.toLowerCase())) {
      toast({ variant: 'destructive', title: 'Strategy already exists', description: `"${name}" is already in your strategy list.` });
      return;
    }
    setIsSavingStrategy(true);
    try {
      const created = await addStrategyAssignment({ symbol: '', strategy: name });
      setAssignments((prev) => [...prev, created]);
      setNewStrategyName('');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to add strategy', description: error.message });
    } finally {
      setIsSavingStrategy(false);
    }
  }, [newStrategyName, strategies, toast]);

  const handleAssignToStrategy = useCallback(async (symbol: string, targetStrategy: string) => {
    const alreadyAssigned = assignments.some((a) => a.symbol === symbol && a.strategy === targetStrategy);
    if (alreadyAssigned) return;

    setIsSavingStrategy(true);
    try {
      const created = await addStrategyAssignment({ symbol, strategy: targetStrategy });
      setAssignments((prev) => [...prev, created]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to assign holding', description: error.message });
    } finally {
      setIsSavingStrategy(false);
    }
  }, [assignments, toast]);

  const handleUnassign = useCallback(async (assignmentId: string) => {
    setIsSavingStrategy(true);
    try {
      await deleteStrategyAssignment(assignmentId);
      // Row-based ids shift for everything below the deleted row, so a full
      // refetch (rather than an optimistic local filter) keeps every
      // remaining assignment's id correctly pointed at its real sheet row.
      const fresh = await getStrategyAssignments();
      setAssignments(fresh);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to remove assignment', description: error.message });
    } finally {
      setIsSavingStrategy(false);
    }
  }, [toast]);

  const handleStartRenameStrategy = useCallback((name: string) => {
    setEditingStrategyName(name);
    setEditingStrategyValue(name);
  }, []);

  const handleCancelRenameStrategy = useCallback(() => {
    setEditingStrategyName(null);
    setEditingStrategyValue('');
  }, []);

  const handleConfirmRenameStrategy = useCallback(async (oldName: string) => {
    const newName = editingStrategyValue.trim();
    if (!newName || newName === oldName) {
      handleCancelRenameStrategy();
      return;
    }
    if (strategies.some((s) => s.toLowerCase() === newName.toLowerCase() && s !== oldName)) {
      toast({ variant: 'destructive', title: 'Strategy already exists', description: `"${newName}" is already in your strategy list.` });
      return;
    }
    setIsSavingStrategy(true);
    try {
      await renameStrategy(oldName, newName);
      const fresh = await getStrategyAssignments();
      setAssignments(fresh);
      handleCancelRenameStrategy();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to rename strategy', description: error.message });
    } finally {
      setIsSavingStrategy(false);
    }
  }, [editingStrategyValue, strategies, toast, handleCancelRenameStrategy]);

  const handleDeleteStrategyClick = useCallback(async (name: string) => {
    if (!window.confirm(`Delete strategy "${name}"? Holdings assigned to it will move back to Unassigned.`)) return;
    setIsSavingStrategy(true);
    try {
      await deleteStrategy(name);
      const fresh = await getStrategyAssignments();
      setAssignments(fresh);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to delete strategy', description: error.message });
    } finally {
      setIsSavingStrategy(false);
    }
  }, [toast]);

  // --- Split-a-holding-across-strategies editor ---

  const handleOpenSplitEditor = useCallback((h: HoldingWithStrategy) => {
    const initial: Record<string, string> = {};
    strategies.forEach((s) => {
      const existing = h.strategyAssignments.find((sa) => sa.strategy === s);
      if (existing) {
        initial[s] = String(typeof existing.quantity === 'number' ? existing.quantity : h.quantity);
      }
    });
    setSplitAllocations(initial);
    setSplitEditorSymbol(h.displaySymbol);
    try {
      localStorage.setItem(SPLIT_EDITOR_STORAGE_KEY, h.displaySymbol);
    } catch {
      // localStorage unavailable (private browsing, SSR, etc.) — the editor
      // still works for this session, it just won't survive a refresh.
    }
  }, [strategies]);

  const handleCloseSplitEditor = useCallback(() => {
    setSplitEditorSymbol(null);
    setSplitAllocations({});
    try {
      localStorage.removeItem(SPLIT_EDITOR_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Re-open whichever holding's split editor was open before a refresh.
  // Guarded to run once: holdingsWithStrategy is recomputed on every poll,
  // and re-running this after the user has since closed (or switched) the
  // editor would clobber their in-progress edits.
  useEffect(() => {
    if (hasRestoredSplitEditor.current) return;
    if (holdingsWithStrategy.length === 0) return;
    hasRestoredSplitEditor.current = true;
    try {
      const stored = localStorage.getItem(SPLIT_EDITOR_STORAGE_KEY);
      if (!stored) return;
      const holding = holdingsWithStrategy.find((h) => h.displaySymbol === stored);
      if (holding) {
        handleOpenSplitEditor(holding);
      } else {
        localStorage.removeItem(SPLIT_EDITOR_STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable — nothing to restore
    }
  }, [holdingsWithStrategy, handleOpenSplitEditor]);

  const handleSplitAllocationChange = useCallback((strategy: string, value: string) => {
    setSplitAllocations((prev) => ({ ...prev, [strategy]: value }));
  }, []);

  const handleSaveSplit = useCallback(async (h: HoldingWithStrategy) => {
    const entries = Object.entries(splitAllocations)
      .map(([strategy, raw]) => ({ strategy, quantity: parseFloat(raw) }))
      .filter((e) => !isNaN(e.quantity) && e.quantity > 0);

    const total = entries.reduce((s, e) => s + e.quantity, 0);
    if (total > h.quantity + 1e-9) {
      toast({
        variant: 'destructive',
        title: 'Allocation exceeds holding quantity',
        description: `You allocated ${total} but only ${h.quantity} units are held.`,
      });
      return;
    }

    setIsSavingSplit(true);
    try {
      // Remove/adjust every existing assignment for this holding, then add
      // any brand-new ones — always writing an explicit quantity so partial
      // allocations are unambiguous going forward.
      for (const sa of h.strategyAssignments) {
        const kept = entries.find((e) => e.strategy === sa.strategy);
        if (!kept) {
          await deleteStrategyAssignment(sa.id);
        } else if (kept.quantity !== sa.quantity) {
          await updateStrategyAssignment(sa.id, { quantity: kept.quantity });
        }
      }
      for (const e of entries) {
        const existed = h.strategyAssignments.some((sa) => sa.strategy === e.strategy);
        if (!existed) {
          await addStrategyAssignment({ symbol: h.displaySymbol, strategy: e.strategy, quantity: e.quantity });
        }
      }

      const fresh = await getStrategyAssignments();
      setAssignments(fresh);
      handleCloseSplitEditor();
      toast({ title: 'Allocation updated', description: `${h.displaySymbol} split across ${entries.length} ${entries.length === 1 ? 'strategy' : 'strategies'}.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to save split', description: error.message });
    } finally {
      setIsSavingSplit(false);
    }
  }, [splitAllocations, toast, handleCloseSplitEditor]);

  const handleChipDragStart = (e: DragEvent<HTMLDivElement>, payload: DragPayload) => {
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnStrategy = (e: DragEvent<HTMLDivElement>, targetStrategy: string) => {
    e.preventDefault();
    setDragOverTarget(null);
    try {
      const payload: DragPayload = JSON.parse(e.dataTransfer.getData('application/json'));
      if (payload.sourceStrategy === targetStrategy) return; // dropped back onto the same card
      handleAssignToStrategy(payload.symbol, targetStrategy);
    } catch {
      // ignore malformed/foreign drag payloads
    }
  };

  const handleDropOnUnassigned = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverTarget(null);
    try {
      const payload: DragPayload = JSON.parse(e.dataTransfer.getData('application/json'));
      if (payload.assignmentId) handleUnassign(payload.assignmentId);
    } catch {
      // ignore malformed/foreign drag payloads
    }
  };

  const runMcpToolCall = async () => {
    if (!selectedTool) return;
    setIsExecutingTool(true);
    setMcpResult(null);
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolArguments);
      } catch {
        throw new Error("Invalid Input JSON structure specified inside arguments payload box.");
      }

      const response = await fetch('/api/paytm-portfolio?action=execute_mcp_tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: selectedTool, arguments: parsedArgs })
      });
      const data = await response.json();
      setMcpResult(data);
      toast({ title: 'MCP Tool Run Complete', description: `Successfully completed call context for ${selectedTool}` });
    } catch (err: any) {
      setMcpResult({ error: err.message });
      toast({ variant: 'destructive', title: 'MCP Call Failure', description: err.message });
    } finally {
      setIsExecutingTool(false);
    }
  };

  const startOAuthFlow = async () => {
    try {
      const response = await fetch('/api/paytm-portfolio?action=login_url', { credentials: 'include' });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.login_url) window.open(data.login_url, '_self');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to initialize OAuth flow' });
    }
  };

  useEffect(() => {
    async function handleExchangeToken() {
      if (!requestToken) return;
      setIsLoadingPortfolio(true);
      try {
        const response = await fetch(`/api/paytm-portfolio?action=exchange_token&request_token=${encodeURIComponent(requestToken)}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Exchange failed');
        toast({ title: 'Success', description: 'Read-scoped access token mapped successfully.' });
        router.replace('/paytm-portfolio');
        checkStatus();
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Exchange Error', description: err.message });
      } finally {
        setIsLoadingPortfolio(false);
      }
    }
    handleExchangeToken();
  }, [requestToken, router, checkStatus, toast]);

  useEffect(() => {
    if (requestToken) return;
    checkStatus();
  }, [checkStatus, requestToken]);

  useEffect(() => {
    fetchStrategyAssignments();
  }, [fetchStrategyAssignments]);

  useEffect(() => {
    if (status && status.hasAccessToken && status.tokenExpired && !requestToken) {
      fetch('/api/paytm-portfolio?action=clear_token', { credentials: 'include' }).then(() => {
        setStatus(prev => prev ? { ...prev, hasAccessToken: false, tokenExpired: false } : prev);
      });
    }
  }, [status, requestToken]);

  useEffect(() => {
    if (status?.hasAccessToken && !status?.tokenExpired && !requestToken) {
      fetchPortfolio();
    }
  }, [status?.hasAccessToken, status?.tokenExpired, fetchPortfolio, requestToken]);

  useEffect(() => {
    if (!status?.hasAccessToken || status?.tokenExpired || !isAutoRefreshEnabled) return;

    const countdownId = setInterval(() => {
      setSecondsUntilNextRefresh((prev) => {
        if (prev <= 1) {
          fetchPortfolio();
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownId);
  }, [status?.hasAccessToken, status?.tokenExpired, isAutoRefreshEnabled, refreshInterval, fetchPortfolio]);

  const handleIntervalChange = (seconds: number) => {
    setRefreshInterval(seconds);
    setSecondsUntilNextRefresh(seconds);
    setIsAutoRefreshEnabled(seconds !== 0);
  };

  const activeJwtMeta = portfolio?.jwtMeta || status?.jwtMeta;
  const isTokenError = portfolioError?.includes('expired') || portfolioError?.includes('token') || portfolioError?.includes('401');
  const needsAuth = status && status.apiKeyConfigured && status.secretConfigured && (!status.hasAccessToken || status.tokenExpired);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paytm Money Portfolio Terminal</h1>
          <p className="text-muted-foreground text-sm mt-1">Debugging cryptographic token lifetime bounds</p>
        </div>
        <div className="flex items-center gap-2">
          {status?.hasAccessToken && !status?.tokenExpired && (
            <div className="flex items-center gap-2 border rounded-lg p-1.5 bg-slate-50 text-xs font-medium mr-2">
              <Timer className="h-3.5 w-3.5 text-slate-500" />
              <span>Interval:</span>
              <select
                value={refreshInterval}
                onChange={(e) => handleIntervalChange(Number(e.target.value))}
                className="bg-transparent border-none outline-none font-semibold text-slate-700 cursor-pointer"
              >
                <option value={60}>1 Min</option>
                <option value={300}>5 Mins</option>
                <option value={600}>10 Mins</option>
                <option value={0}>Off</option>
              </select>
              {isAutoRefreshEnabled && (
                <span className="text-xxs text-slate-400 font-mono ml-1">
                  ({secondsUntilNextRefresh}s)
                </span>
              )}
            </div>
          )}
          <Button variant="outline" onClick={() => { checkStatus(); if(status?.hasAccessToken) fetchPortfolio(); }} disabled={isLoadingStatus || isLoadingPortfolio}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {portfolio && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground font-medium">Total Investment</p>
              <p className="text-xl font-bold mt-1 tabular-nums">{formatINR(portfolio.totalInvestment)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground font-medium">Current Value</p>
              <p className="text-xl font-bold mt-1 tabular-nums">{formatINR(portfolio.totalCurrentValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground font-medium">Total P&L</p>
              <p className={`text-xl font-bold mt-1 tabular-nums ${portfolio.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatINR(portfolio.totalPnl)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground font-medium">Returns %</p>
              <p className={`text-xl font-bold mt-1 tabular-nums flex items-center gap-1.5 ${portfolio.totalPnlPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {portfolio.totalPnlPercent >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {portfolio.totalPnlPercent.toFixed(2)}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {status && (!status.apiKeyConfigured || !status.secretConfigured) && !isLoadingStatus && (
        <Card className="border-destructive/50">
          <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><AlertCircle className="h-5 w-5" />Setup Required</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Set the following environment variables:</p>
            <div className="bg-muted rounded-lg p-3 font-mono text-xs space-y-1">
              <p>PAYTM_MONEY_API_KEY=<span className="text-muted-foreground">your_api_key</span></p>
              <p>PAYTM_MONEY_SECRET=<span className="text-muted-foreground">your_api_secret</span></p>
            </div>
          </CardContent>
        </Card>
      )}

      {needsAuth && !isLoadingStatus && (
        <Card className="border-yellow-400/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-yellow-500" />OAuth Handshake Required</CardTitle>
            <CardDescription>Connect your verified credentials to start streaming historical holdings metrics.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={startOAuthFlow} className="w-full" size="lg"><ExternalLink className="mr-2 h-4 w-4" />Authorize Paytm Money Session</Button>
            <div className="mt-3 text-xxs text-muted-foreground bg-muted p-2 rounded font-mono break-all">
              Callback URI: {typeof window !== 'undefined' ? window.location.origin : ''}/paytm-portfolio
            </div>
          </CardContent>
        </Card>
      )}

      {portfolioError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="w-full">
              <p className="text-sm font-semibold text-destructive">Upstream Lifetime Fault Detected</p>
              <p className="text-xs font-mono text-slate-600 mt-1 break-all">{portfolioError}</p>
              <div className="flex gap-2 mt-3">
                <Button variant="destructive" size="sm" onClick={startOAuthFlow}><RefreshCcw className="mr-2 h-3.5 w-3.5" />Re-authenticate Session</Button>
                <Button variant="outline" size="sm" onClick={fetchPortfolio}><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry Fetch</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* --- Asset Holdings Detail + Sector Diversification Matrix (moved to top) --- */}
      {portfolio && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <Card className="lg:col-span-2 flex flex-col">
            <CardHeader
              className="pb-2 cursor-pointer select-none"
              onClick={() => setIsHoldingsSectionOpen((o) => !o)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Asset Holdings Detail</CardTitle>
                  <CardDescription>Live pricing and gains calculated from response array mapping</CardDescription>
                </div>
                <CollapseToggle isOpen={isHoldingsSectionOpen} onToggle={() => setIsHoldingsSectionOpen((o) => !o)} label="Asset Holdings Detail" />
              </div>
            </CardHeader>
            {isHoldingsSectionOpen && (
            <CardContent className="flex-1 flex flex-col min-h-0">
              <div className="flex gap-2 mb-4">
                {portfolio.source && <Badge variant="outline">{portfolio.source}</Badge>}
                {portfolio.agentModel && <Badge variant="secondary">{portfolio.agentModel}</Badge>}
              </div>

              {portfolio.insights && (
                <div className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-lg mb-4 text-sm text-amber-900">
                  <div className="flex items-center gap-1.5 font-semibold text-xs mb-1 text-amber-800"><Lightbulb className="h-3.5 w-3.5" /> AI Observations</div>
                  <p>{portfolio.insights}</p>
                </div>
              )}

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                  type="text"
                  value={filterSymbol}
                  onChange={(e) => setFilterSymbol(e.target.value)}
                  placeholder="Filter by symbol or name…"
                  className="text-xs p-1.5 border rounded-md outline-none min-w-[180px]"
                />
                <select
                  value={filterSector}
                  onChange={(e) => setFilterSector(e.target.value)}
                  className="text-xs p-1.5 border rounded-md outline-none bg-white"
                >
                  <option value="">All sectors</option>
                  {sectorOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={filterStrategy}
                  onChange={(e) => setFilterStrategy(e.target.value)}
                  className="text-xs p-1.5 border rounded-md outline-none bg-white"
                >
                  <option value="">All strategies</option>
                  <option value={UNASSIGNED_FILTER_VALUE}>Unassigned</option>
                  <option value={REMAINING_FILTER_VALUE}>Has unassigned qty (incl. splits)</option>
                  {strategies.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {(filterSymbol || filterSector || filterStrategy) && (
                  <button
                    type="button"
                    onClick={() => { setFilterSymbol(''); setFilterSector(''); setFilterStrategy(''); }}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Clear filters
                  </button>
                )}
                <span className="text-xxs text-muted-foreground ml-auto">
                  Showing {filteredHoldings.length} of {holdingsWithStrategy.length}
                </span>
              </div>

              <ScrollArea className="flex-1 min-h-[220px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Strategy</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Avg Price</TableHead>
                      <TableHead className="text-right">LTP</TableHead>
                      <TableHead className="text-right">Total P&L</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHoldings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-xs text-muted-foreground italic py-6">
                          No holdings match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredHoldings.map((h) => (
                      <Fragment key={h.displaySymbol}>
                      <TableRow>
                        <TableCell className="font-semibold">
                          <span className="flex items-center gap-1.5" title={h.name && h.name !== h.displaySymbol ? h.name : undefined}>
                            {h.displaySymbol}
                            {h.isSyntheticSymbol && (
                              <span className="text-xxs font-normal text-slate-400" title={`Original symbol from Paytm: "${h.trading_symbol}"`}>
                                (auto)
                              </span>
                            )}
                            {newlyDiscoveredSymbols.has(h.displaySymbol) && (
                              <Badge className="font-semibold text-[9px] px-1.5 py-0" style={{ backgroundColor: NEW_HOLDING_COLOR, color: 'white' }}>
                                NEW
                              </Badge>
                            )}
                          </span>
                          {h.name && h.name !== h.displaySymbol && (
                            <p className="text-xxs font-normal text-slate-400 truncate max-w-[180px]" title={h.name}>{h.name}</p>
                          )}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="font-normal">{h.sector}</Badge></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {h.strategyAssignments.length === 0 && (
                              <Badge variant="outline" className="font-normal" style={{ color: UNASSIGNED_COLOR, borderColor: UNASSIGNED_COLOR }}>
                                Unassigned
                              </Badge>
                            )}
                            {h.strategyAssignments.map((sa) => {
                              const isSplit = typeof sa.quantity === 'number' && sa.quantity !== h.quantity;
                              return (
                                <Badge
                                  key={sa.id}
                                  variant="outline"
                                  className="font-normal pr-1 flex items-center gap-0.5"
                                  style={{ color: getStrategyColor(sa.strategy, strategies), borderColor: getStrategyColor(sa.strategy, strategies) }}
                                  title={isSplit ? `${sa.quantity} of ${h.quantity} units allocated to ${sa.strategy}` : undefined}
                                >
                                  {sa.strategy}{isSplit ? ` (${sa.quantity}/${h.quantity})` : ''}
                                  <button
                                    type="button"
                                    onClick={() => handleUnassign(sa.id)}
                                    aria-label={`Remove ${h.displaySymbol} from ${sa.strategy}`}
                                    className="rounded hover:bg-black/10 p-0.5 ml-0.5"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </Badge>
                              );
                            })}
                            {h.strategyAssignments.length > 0 && h.remainingQuantity > 0 && (
                              <span className="text-xxs text-slate-400" title="Portion of this holding not yet assigned to a strategy">
                                {h.remainingQuantity} unassigned
                              </span>
                            )}
                            {strategies.filter((s) => !h.strategyAssignments.some((sa) => sa.strategy === s)).length > 0 && (
                              <select
                                value=""
                                disabled={isSavingStrategy}
                                onChange={(e) => { if (e.target.value) handleAssignToStrategy(h.displaySymbol, e.target.value); e.target.value = ''; }}
                                className="text-[10px] border rounded px-1 py-0.5 bg-white text-slate-500 outline-none cursor-pointer disabled:opacity-60"
                              >
                                <option value="">+ Add</option>
                                {strategies
                                  .filter((s) => !h.strategyAssignments.some((sa) => sa.strategy === s))
                                  .map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                              </select>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{h.quantity}</TableCell>
                        <TableCell className="text-right">₹{h.average_price.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{h.last_price.toFixed(2)}</TableCell>
                        <TableCell className={`text-right ${h.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatINR(h.pnl)} ({h.pnl_percent.toFixed(2)}%)
                        </TableCell>
                        <TableCell className="text-right">
                          {strategies.length > 0 && (
                            <button
                              type="button"
                              onClick={() => splitEditorSymbol === h.displaySymbol ? handleCloseSplitEditor() : handleOpenSplitEditor(h)}
                              title="Split this holding's quantity across strategies"
                              aria-label={`Split ${h.displaySymbol} across strategies`}
                              className="p-1 rounded hover:bg-black/5 text-slate-400 hover:text-slate-600"
                            >
                              <SplitSquareHorizontal className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                      {splitEditorSymbol === h.displaySymbol && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-slate-50/70 border-t-0">
                            <div className="p-3 rounded-md border bg-white">
                              <p className="text-xs font-semibold text-slate-600 mb-2">
                                Split {h.displaySymbol} ({h.quantity} units) across strategies
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                                {strategies.map((s) => (
                                  <label key={s} className="flex items-center gap-2 text-xs">
                                    <span className="flex-1 truncate" style={{ color: getStrategyColor(s, strategies) }}>{s}</span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={splitAllocations[s] ?? ''}
                                      onChange={(e) => handleSplitAllocationChange(s, e.target.value)}
                                      placeholder="0"
                                      className="w-20 text-xs p-1 border rounded outline-none text-right"
                                    />
                                  </label>
                                ))}
                              </div>
                              {(() => {
                                const allocated = Object.values(splitAllocations).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                                const over = allocated > h.quantity + 1e-9;
                                return (
                                  <p className={`text-xxs mb-2 ${over ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                                    Allocated {allocated} of {h.quantity} units{over ? ' — exceeds holding quantity' : ''}
                                  </p>
                                );
                              })()}
                              <div className="flex items-center gap-2">
                                <Button size="sm" onClick={() => handleSaveSplit(h)} disabled={isSavingSplit}>
                                  {isSavingSplit ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                                  Save Split
                                </Button>
                                <button type="button" onClick={handleCloseSplitEditor} className="text-xs text-slate-500 hover:text-slate-700 underline">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      </Fragment>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
            )}
          </Card>

          {portfolio.sectorBreakdown && portfolio.sectorBreakdown.length > 0 && (
            <Card>
              <CardHeader
                className="pb-2 cursor-pointer select-none"
                onClick={() => setIsSectorSectionOpen((o) => !o)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base"><PieChart className="h-4 w-4" />Sector Diversification Matrix</CardTitle>
                    <CardDescription>Proportional exposure computed from real asset sector objects</CardDescription>
                  </div>
                  <CollapseToggle isOpen={isSectorSectionOpen} onToggle={() => setIsSectorSectionOpen((o) => !o)} label="Sector Diversification Matrix" />
                </div>
              </CardHeader>
              {isSectorSectionOpen && (
              <CardContent>
                <SectorDiversificationChart data={portfolio.sectorBreakdown} />
                <div className="mt-4 space-y-3">
                  {portfolio.sectorBreakdown.map((s, idx) => (
                    <div key={s.sector} className="flex items-start justify-between gap-2 text-sm">
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-1.5 h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: SECTOR_COLORS[idx % SECTOR_COLORS.length] }}
                        />
                        <div>
                          <p className="font-medium leading-none">{s.sector}</p>
                          <p className="text-xxs text-muted-foreground mt-1">Current:</p>
                          <p className="text-xs font-semibold tabular-nums">{formatINR(s.currentValue)}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant="secondary" className="font-mono">{s.percent.toFixed(2)}%</Badge>
                        <p className="text-xxs text-muted-foreground mt-1">P&L:</p>
                        <p className={`text-xs font-semibold tabular-nums ${s.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatINR(s.pnl)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              )}
            </Card>
          )}
        </div>
      )}

      {/* --- Strategy Allocation (drag & drop, below Asset Holdings Detail) --- */}
      {portfolio && (
        <Card>
          <CardHeader
            className="pb-2 cursor-pointer select-none"
            onClick={() => setIsStrategySectionOpen((o) => !o)}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4" />Strategy Allocation</CardTitle>
                <CardDescription>Drag a holding out of Unassigned onto a strategy to categorize it — one asset can belong to more than one strategy</CardDescription>
                {!isLoadingStrategies && (
                  <p className="text-xxs text-muted-foreground mt-1">
                    {assignments.length > 0 ? (
                      <>Loaded {strategies.length} saved {strategies.length === 1 ? 'strategy' : 'strategies'} and {assignments.filter((a) => a.symbol).length} mapping{assignments.filter((a) => a.symbol).length === 1 ? '' : 's'} from the "Strategy" sheet.</>
                    ) : (
                      <>No saved allocation found in the "Strategy" sheet yet — add a strategy below to get started.</>
                    )}
                  </p>
                )}
              </div>
              <CollapseToggle isOpen={isStrategySectionOpen} onToggle={() => setIsStrategySectionOpen((o) => !o)} label="Strategy Allocation" />
            </div>
          </CardHeader>
          {isStrategySectionOpen && (
            <CardContent>
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <input
                  type="text"
                  value={newStrategyName}
                  onChange={(e) => setNewStrategyName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddStrategy(); }}
                  placeholder="New strategy name e.g. Coffee Can"
                  disabled={isSavingStrategy}
                  className="flex-1 min-w-[220px] text-sm p-2 border rounded-md outline-none disabled:opacity-60"
                />
                <Button size="sm" onClick={handleAddStrategy} disabled={isSavingStrategy || !newStrategyName.trim()}>
                  {isSavingStrategy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Add Strategy
                </Button>
                {isLoadingStrategies && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Loading saved strategies…</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* Unassigned pool — the drag source, and also a drop target for removing an assignment */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOverTarget(''); }}
                  onDragLeave={() => setDragOverTarget((t) => (t === '' ? null : t))}
                  onDrop={handleDropOnUnassigned}
                  className={`rounded-lg border-2 border-dashed overflow-hidden bg-slate-50/60 flex flex-col transition-colors ${dragOverTarget === '' ? 'border-slate-400 bg-slate-100' : 'border-slate-300'}`}
                >
                  <div className="px-4 py-2.5 bg-slate-200 text-slate-700 font-semibold text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      Unassigned
                      {unassignedHoldings.some((h) => newlyDiscoveredSymbols.has(h.displaySymbol)) && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: NEW_HOLDING_COLOR }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: NEW_HOLDING_COLOR }} />
                          New holdings
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-normal">{unassignedHoldings.length} holdings</span>
                  </div>
                  <div className="grid grid-cols-3 divide-x border-b bg-slate-100/60">
                    <div className="px-2 py-2 text-center">
                      <p className="text-xxs text-muted-foreground">Sum</p>
                      <p className="text-xs font-bold tabular-nums">{formatINR(unassignedSummary.currentValue)}</p>
                    </div>
                    <div className="px-2 py-2 text-center">
                      <p className="text-xxs text-muted-foreground">P&L</p>
                      <p className={`text-xs font-bold tabular-nums ${unassignedSummary.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatINR(unassignedSummary.pnl)}</p>
                    </div>
                    <div className="px-2 py-2 text-center">
                      <p className="text-xxs text-muted-foreground">Return %</p>
                      <p className={`text-xs font-bold tabular-nums ${unassignedSummary.pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{unassignedSummary.pnlPercent.toFixed(2)}%</p>
                    </div>
                  </div>
                  <div className="p-3 flex flex-wrap gap-2 min-h-[120px] flex-1">
                    {unassignedHoldings.length === 0 ? (
                      <p className="text-xxs text-muted-foreground italic">All holdings are categorized.</p>
                    ) : (
                      unassignedHoldings.map((h) => {
                        const isNew = newlyDiscoveredSymbols.has(h.displaySymbol);
                        return (
                          <div
                            key={h.displaySymbol}
                            draggable
                            onDragStart={(e) => handleChipDragStart(e, { symbol: h.displaySymbol, assignmentId: null, sourceStrategy: null })}
                            className="px-2.5 py-1.5 rounded-md border text-xs font-semibold cursor-grab active:cursor-grabbing shadow-sm select-none flex items-center gap-1.5"
                            style={isNew ? { backgroundColor: '#FFFBEB', borderColor: NEW_HOLDING_COLOR, color: '#92400E' } : { backgroundColor: 'white' }}
                            title={
                              getSplitBreakdownTooltip(h) ??
                              (h.isSyntheticSymbol
                                ? `Original symbol from Paytm: "${h.trading_symbol}"`
                                : (h.name && h.name !== h.displaySymbol ? h.name : undefined))
                            }
                          >
                            {isNew && <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: NEW_HOLDING_COLOR }} />}
                            {h.displaySymbol}
                            {h.remainingQuantity < h.quantity && (
                              <span className="text-[10px] font-normal opacity-70">({h.remainingQuantity} left)</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {strategySummaries.length === 0 ? (
                  <div className="md:col-span-2 xl:col-span-2 flex items-center justify-center text-xs text-muted-foreground italic border rounded-lg p-6">
                    No strategies yet — add one above, then drag a holding from Unassigned onto it.
                  </div>
                ) : (
                  strategySummaries.map((s) => {
                    const color = getStrategyColor(s.strategy, strategies);
                    const isDragOver = dragOverTarget === s.strategy;
                    return (
                      <div
                        key={s.strategy}
                        onDragOver={(e) => { e.preventDefault(); setDragOverTarget(s.strategy); }}
                        onDragLeave={() => setDragOverTarget((t) => (t === s.strategy ? null : t))}
                        onDrop={(e) => handleDropOnStrategy(e, s.strategy)}
                        className={`rounded-lg border overflow-hidden bg-white flex flex-col transition-shadow ${isDragOver ? 'ring-2 ring-offset-1' : ''}`}
                        style={isDragOver ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
                      >
                        <div className="px-4 py-2.5 text-white font-semibold text-sm flex items-center justify-between gap-2" style={{ backgroundColor: color }}>
                          {editingStrategyName === s.strategy ? (
                            <div className="flex items-center gap-1 flex-1">
                              <input
                                autoFocus
                                type="text"
                                value={editingStrategyValue}
                                onChange={(e) => setEditingStrategyValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleConfirmRenameStrategy(s.strategy);
                                  if (e.key === 'Escape') handleCancelRenameStrategy();
                                }}
                                disabled={isSavingStrategy}
                                className="flex-1 text-xs p-1 rounded text-slate-800 outline-none disabled:opacity-60"
                              />
                              <button
                                type="button"
                                onClick={() => handleConfirmRenameStrategy(s.strategy)}
                                aria-label={`Save new name for ${s.strategy}`}
                                className="p-1 rounded hover:bg-white/20"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelRenameStrategy}
                                aria-label="Cancel rename"
                                className="p-1 rounded hover:bg-white/20"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="truncate">{s.strategy}</span>
                              <span className="flex items-center gap-0.5 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleStartRenameStrategy(s.strategy)}
                                  aria-label={`Rename ${s.strategy}`}
                                  title="Rename strategy"
                                  disabled={isSavingStrategy}
                                  className="p-1 rounded hover:bg-white/20 disabled:opacity-60"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStrategyClick(s.strategy)}
                                  aria-label={`Delete ${s.strategy}`}
                                  title="Delete strategy"
                                  disabled={isSavingStrategy}
                                  className="p-1 rounded hover:bg-white/20 disabled:opacity-60"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </span>
                            </>
                          )}
                        </div>
                        <div className="grid grid-cols-3 divide-x border-b bg-slate-50/60">
                          <div className="px-2 py-2 text-center">
                            <p className="text-xxs text-muted-foreground">Sum</p>
                            <p className="text-xs font-bold tabular-nums">{formatINR(s.currentValue)}</p>
                          </div>
                          <div className="px-2 py-2 text-center">
                            <p className="text-xxs text-muted-foreground">P&L</p>
                            <p className={`text-xs font-bold tabular-nums ${s.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatINR(s.pnl)}</p>
                          </div>
                          <div className="px-2 py-2 text-center">
                            <p className="text-xxs text-muted-foreground">Return %</p>
                            <p className={`text-xs font-bold tabular-nums ${s.pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{s.pnlPercent.toFixed(2)}%</p>
                          </div>
                        </div>
                        <div className="p-3 flex flex-wrap gap-2 min-h-[100px] flex-1 max-h-[220px] overflow-y-auto content-start">
                          {s.holdings.length === 0 ? (
                            <p className="text-xxs text-muted-foreground italic">Drop a holding here to assign it.</p>
                          ) : (
                            s.holdings.map((h) => {
                              const assignment = h.strategyAssignments.find((sa) => sa.strategy === s.strategy)!;
                              const isSplit = typeof assignment.quantity === 'number' && assignment.quantity !== h.quantity;
                              const tooltip = getSplitBreakdownTooltip(h) ?? (
                                h.isSyntheticSymbol
                                  ? `Original symbol from Paytm: "${h.trading_symbol}"`
                                  : (h.name && h.name !== h.displaySymbol ? h.name : undefined)
                              );
                              return (
                                <div
                                  key={assignment.id}
                                  draggable
                                  onDragStart={(e) => handleChipDragStart(e, { symbol: h.displaySymbol, assignmentId: assignment.id, sourceStrategy: s.strategy })}
                                  className="flex items-center gap-1 pl-2.5 pr-1.5 py-1.5 rounded-md text-white text-xs font-semibold cursor-grab active:cursor-grabbing shadow-sm select-none"
                                  style={{ backgroundColor: color }}
                                  title={tooltip}
                                >
                                  {h.displaySymbol}
                                  {isSplit && <span className="text-[10px] font-normal opacity-80">({assignment.quantity}/{h.quantity})</span>}
                                  <button
                                    type="button"
                                    onClick={() => handleUnassign(assignment.id)}
                                    aria-label={`Remove ${h.displaySymbol} from ${s.strategy}`}
                                    className="ml-0.5 rounded hover:bg-black/20 p-0.5"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* --- Diagnostics & Connection group: clocks, JWT, connection status, MCP tools — collapsed by default, at the bottom --- */}
      <Card className="border-slate-200">
        <CardHeader
          className="pb-2 cursor-pointer select-none"
          onClick={() => setIsDiagnosticsSectionOpen((o) => !o)}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />Diagnostics &amp; Connection</CardTitle>
              <CardDescription>Clocks, JWT claims, connection health, and the MCP tool console</CardDescription>
            </div>
            <CollapseToggle isOpen={isDiagnosticsSectionOpen} onToggle={() => setIsDiagnosticsSectionOpen((o) => !o)} label="Diagnostics & Connection" />
          </div>
        </CardHeader>
        {isDiagnosticsSectionOpen && (
          <CardContent className="space-y-6 pt-2">
            {/* Clocks */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Clocks</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border p-3 flex items-center gap-3 bg-white">
                  <Laptop className="h-5 w-5 text-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Browser Clock</p>
                    <p className="text-sm font-semibold tabular-nums">{clientTime}</p>
                  </div>
                </div>
                <div className="rounded-lg border p-3 flex items-center gap-3 bg-white">
                  <Server className="h-5 w-5 text-purple-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">App Server Time</p>
                    <p className="text-sm font-semibold tabular-nums">{status?.serverTimestamp ? new Date(status.serverTimestamp).toLocaleString() : 'Loading...'}</p>
                  </div>
                </div>
                <div className="rounded-lg border p-3 flex items-center gap-3 bg-white">
                  <Clock className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Paytm Response Time</p>
                    <p className="text-sm font-bold text-emerald-900 tabular-nums">{portfolio?.paytmApiTimestamp ? new Date(portfolio.paytmApiTimestamp).toLocaleString() : 'No Connection'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* JWT Claims Inspector */}
            <div>
              <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5" />JWT Claims Inspector</h4>
              {activeJwtMeta ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-white border rounded-lg shadow-sm">
                    <span className="text-xs font-semibold text-purple-700 block mb-1">CLAIM: Issued At (iat)</span>
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{activeJwtMeta.iatStr ? new Date(activeJwtMeta.iatStr).toLocaleString() : 'N/A'}</p>
                    <span className="text-xxs text-slate-400 block mt-1">Unix timestamp: {activeJwtMeta.rawIat}</span>
                  </div>
                  <div className="p-3 bg-white border rounded-lg shadow-sm">
                    <span className="text-xs font-semibold text-purple-700 block mb-1">CLAIM: Expires At (exp)</span>
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{activeJwtMeta.expStr ? new Date(activeJwtMeta.expStr).toLocaleString() : 'N/A'}</p>
                    <span className="text-xxs text-slate-400 block mt-1">Unix timestamp: {activeJwtMeta.rawExp}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2 italic">Authenticate or fetch portfolio metrics to read token payload properties.</p>
              )}
            </div>

            {/* Connection Status */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />Connection Status</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatusIndicator ok={status?.apiKeyConfigured} label="API Key" subtext={status?.apiKeyConfigured ? 'Secured' : 'Missing'} />
                <StatusIndicator ok={status?.secretConfigured} label="API Secret" subtext={status?.secretConfigured ? 'Secured' : 'Missing'} />
                <StatusIndicator ok={status?.hasAccessToken && !isTokenError} label="Session State" subtext={status?.hasAccessToken && !isTokenError ? 'Active Read Token' : 'OAuth Required'} />
                <StatusIndicator ok={!!portfolio} label="Data Pipeline" subtext={portfolio ? 'Synced' : 'Dormant'} />
              </div>
            </div>

            {/* MCP Tools */}
            {status?.hasAccessToken && !status?.tokenExpired && status.tools && status.tools.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" />Available Model Context Protocol (MCP) Tools</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1 space-y-2">
                      <label className="text-xs font-semibold text-slate-600 block">Select Target Function</label>
                      <select
                        className="w-full text-xs p-2 border rounded-md outline-none bg-white font-medium"
                        value={selectedTool}
                        onChange={(e) => setSelectedTool(e.target.value)}
                      >
                        {status.tools.map((t, idx) => (
                          <option key={idx} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                      <div className="p-2.5 bg-slate-50 border rounded-md text-xxs text-slate-500 italic mt-2">
                        {status.tools.find(t => t.name === selectedTool)?.description}
                      </div>
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-semibold text-slate-600 block">Arguments Object payload (JSON)</label>
                      <textarea
                        className="w-full h-[85px] p-2 border rounded-md font-mono text-xs outline-none bg-white resize-none"
                        value={toolArguments}
                        onChange={(e) => setToolArguments(e.target.value)}
                        placeholder='{"symbol": "INFY", "exchange": "NSE"}'
                      />
                    </div>
                  </div>

                  <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700" onClick={runMcpToolCall} disabled={isExecutingTool}>
                    {isExecutingTool ? <Loader2 className="animate-spin mr-2 h-3.5 w-3.5" /> : <Play className="mr-2 h-3.5 w-3.5" />}
                    Execute Scoped Server Capability
                  </Button>

                  {mcpResult && (
                    <div className="mt-2 border rounded-md overflow-hidden text-xs font-mono">
                      <div className="bg-slate-800 text-slate-200 p-1.5 flex justify-between items-center text-xxs">
                        <span>CONSOLE RESPONSE OUTPUT</span>
                        <span className="opacity-60">{mcpResult.timestamp || 'Ready'}</span>
                      </div>
                      <ScrollArea className="h-[120px] bg-slate-950 p-2 text-green-400 overflow-x-auto break-words">
                        <pre>{JSON.stringify(mcpResult, null, 2)}</pre>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default function PaytmPortfolioPage() {
  return <Suspense fallback={<div className="p-8"><Loader2 className="animate-spin text-primary mx-auto h-8 w-8" /></div>}><PaytmPortfolioContent /></Suspense>;
}



