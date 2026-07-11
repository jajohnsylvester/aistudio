'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Loader2, RefreshCw, AlertCircle, CheckCircle, Lightbulb, ExternalLink, Key,
  RefreshCcw, Server, Clock, Laptop, Fingerprint, Timer, Plus, Save, BrainCircuit, ArrowUpDown, ChevronDown, ChevronUp
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MCPStatus {
  connected: boolean;
  hasAccessToken: boolean;
  tokenExpired?: boolean;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  serverTimestamp?: string;
  jwtMeta?: any;
  tools?: any[];
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
}

interface PortfolioData {
  totalInvestment: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdings: Holding[];
  insights: string;
  agentModel?: string;
  lastUpdated: string;
  paytmApiTimestamp?: string;
  jwtMeta?: any;
}

interface Strategy {
  id: string;
  name: string;
  symbols: string[];
  insights?: string;
  isInsightLoading?: boolean;
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

export default function PaytmPortfolioPage() {
  return <Suspense fallback={<div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto" /></div>}><PaytmPortfolioContent /></Suspense>;
}

function PaytmPortfolioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestToken = searchParams.get('request_token');
  const { toast } = useToast();

  const [status, setStatus] = useState<MCPStatus | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  const [clientTime, setClientTime] = useState<string>('');

  // Auto-Refresh States
  const [refreshInterval, setRefreshInterval] = useState<number>(300);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState<boolean>(true);
  const [secondsUntilNextRefresh, setSecondsUntilNextRefresh] = useState<number>(300);

  // Sorting State
  const [sortField, setSortField] = useState<keyof Holding>('trading_symbol');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Collapsible Component States
  const [isClocksExpanded, setIsClocksExpanded] = useState(true);
  const [isJwtExpanded, setIsJwtExpanded] = useState(true);
  const [isStatusMatrixExpanded, setIsStatusMatrixExpanded] = useState(true);

  // Strategy Categorization States
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [isSavingToGoogleSheets, setIsSavingToGoogleSheets] = useState(false);
  const [symbolInputs, setSymbolInputs] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    setClientTime(new Date().toLocaleString());
    const timer = setInterval(() => setClientTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Hydrate custom strategies from LocalStorage on mount
  useEffect(() => {
    const savedStrategies = localStorage.getItem('paytm_portfolio_strategies');
    if (savedStrategies) {
      try { setStrategies(JSON.parse(savedStrategies)); } catch (e) { console.error("Strategy hydration error", e); }
    }
  }, []);

  const saveStrategiesLocal = (updatedStrategies: Strategy[]) => {
    setStrategies(updatedStrategies);
    localStorage.setItem('paytm_portfolio_strategies', JSON.stringify(updatedStrategies));
  };

  const startOAuthFlow = () => {
    window.location.href = '/api/paytm-portfolio?action=login';
  };

  const handleAddStrategy = () => {
    if (!newStrategyName.trim()) return;
    const newStrategy: Strategy = {
      id: Date.now().toString(),
      name: newStrategyName.trim(),
      symbols: [],
    };
    saveStrategiesLocal([...strategies, newStrategy]);
    setNewStrategyName('');
    toast({ title: 'Strategy Formed', description: `Strategy "${newStrategy.name}" initialized successfully.` });
  };

  const handleAddSymbolToStrategy = (strategyId: string) => {
    const inputSymbol = symbolInputs[strategyId]?.trim().toUpperCase();
    if (!inputSymbol) return;

    const updated = strategies.map(strat => {
      if (strat.id === strategyId) {
        if (strat.symbols.includes(inputSymbol)) {
          toast({ title: 'Duplicate Asset', description: `${inputSymbol} is already part of this strategy alignment.` });
          return strat;
        }
        return { ...strat, symbols: [...strat.symbols, inputSymbol] };
      }
      return strat;
    });

    saveStrategiesLocal(updated);
    setSymbolInputs(prev => ({ ...prev, [strategyId]: '' }));
    toast({ title: 'Asset Mapped', description: `Assigned ${inputSymbol} to selected strategy.` });
  };

  const handleRemoveSymbolFromStrategy = (strategyId: string, symbolToRemove: string) => {
    const updated = strategies.map(strat => {
      if (strat.id === strategyId) {
        return { ...strat, symbols: strat.symbols.filter(s => s !== symbolToRemove) };
      }
      return strat;
    });
    saveStrategiesLocal(updated);
  };

  const handleFetchGeminiInsights = async (strategyId: string, strategyName: string, strategyHoldings: Holding[]) => {
    setStrategies(prev => prev.map(s => s.id === strategyId ? { ...s, isInsightLoading: true } : s));
    try {
      const response = await fetch('/api/paytm-portfolio?action=strategy_insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyName, holdings: strategyHoldings })
      });
      const data = await response.json();
      setStrategies(prev => prev.map(s => s.id === strategyId ? { ...s, insights: data.insights || 'No insight analytics returned.', isInsightLoading: false } : s));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'AI Insights Failed', description: err.message });
      setStrategies(prev => prev.map(s => s.id === strategyId ? { ...s, isInsightLoading: false } : s));
    }
  };

  const handleSaveToGoogleSheet = async () => {
    setIsSavingToGoogleSheets(true);
    try {
      const response = await fetch('/api/paytm-portfolio?action=save_strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategies, portfolioHoldings: portfolio?.holdings || [] })
      });
      if (!response.ok) throw new Error('Google Sheets sync operation rejected.');
      toast({ title: 'Sheets Updated', description: 'Strategy mappings and financial breakdowns written successfully.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Sheets Sync Failed', description: err.message });
    } finally {
      setIsSavingToGoogleSheets(false);
    }
  };

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
    } catch {
      toast({ variant: 'destructive', title: 'Status check failed.' });
    } finally {
      setIsLoadingStatus(false);
    }
  }, [toast]);

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

  useEffect(() => {
    if (!requestToken) return;
    async function handleExchangeToken() {
      setIsLoadingPortfolio(true);
      try {
        const response = await fetch(`/api/paytm-portfolio?action=exchange_token&request_token=${encodeURIComponent(requestToken!)}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Exchange failed');
        toast({ title: 'Success', description: 'Read session token registered successfully.' });
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
    if (!requestToken) checkStatus();
  }, [checkStatus, requestToken]);

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

  const toggleSort = (field: keyof Holding) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedHoldings = useMemo(() => {
    if (!portfolio?.holdings) return [];
    return [...portfolio.holdings].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [portfolio?.holdings, sortField, sortDirection]);

  const aggregatedTotals = useMemo(() => {
    if (!portfolio?.holdings || portfolio.holdings.length === 0) {
      return { sumCostPrice: 0, sumLtp: 0, sumCalculatedPnl: 0 };
    }
    const sumCostPrice = portfolio.holdings.reduce((sum, h) => sum + h.average_price, 0);
    const sumLtp = portfolio.holdings.reduce((sum, h) => sum + h.last_price, 0);
    return { sumCostPrice, sumLtp, sumCalculatedPnl: sumLtp - sumCostPrice };
  }, [portfolio?.holdings]);

  // Compute separated dynamic parameters per strategy bucket
  const strategyFinancialsMaps = useMemo(() => {
    if (!portfolio?.holdings) return {};
    const maps: { [key: string]: { holdings: Holding[]; investment: number; current: number; pnl: number; pnlPercent: number; sumCostPrice: number; sumLtp: number } } = {};
    
    strategies.forEach(strategy => {
      const matches = portfolio.holdings.filter(h => strategy.symbols.includes(h.trading_symbol.toUpperCase()));
      const investment = matches.reduce((sum, h) => sum + h.investment_value, 0);
      const current = matches.reduce((sum, h) => sum + h.current_value, 0);
      const sumCostPrice = matches.reduce((sum, h) => sum + h.average_price, 0);
      const sumLtp = matches.reduce((sum, h) => sum + h.last_price, 0);
      const pnl = current - investment;
      const pnlPercent = investment > 0 ? (pnl / investment) * 100 : 0;

      maps[strategy.id] = { holdings: matches, investment, current, pnl, pnlPercent, sumCostPrice, sumLtp };
    });

    return maps;
  }, [strategies, portfolio?.holdings]);

  const activeJwtMeta = portfolio?.jwtMeta || status?.jwtMeta;
  const needsAuth = status && status.apiKeyConfigured && status.secretConfigured && (!status.hasAccessToken || status.tokenExpired);

  return (
    <div className="flex flex-col gap-6 p-4 max-w-7xl mx-auto">
      {/* HEADER CONTROLS */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Paytm Money Portfolio Terminal</h1>
          <p className="text-muted-foreground text-sm mt-1">Debugging cryptographic token lifetime bounds and custom trading strategies</p>
        </div>
        <div className="flex items-center gap-2">
          {status?.hasAccessToken && !status?.tokenExpired && (
            <div className="flex items-center gap-2 border rounded-lg p-1.5 bg-slate-50 text-xs font-medium">
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
              {isAutoRefreshEnabled && <span className="text-xxs text-slate-400 font-mono">({secondsUntilNextRefresh}s)</span>}
            </div>
          )}
          <Button variant="outline" onClick={() => { checkStatus(); if(status?.hasAccessToken) fetchPortfolio(); }} disabled={isLoadingStatus || isLoadingPortfolio}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* STRATEGY ALLOCATION TERMINAL WORKSPACE */}
      <Card className="border-slate-300">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-800">Portfolio Structural Strategy Allocator</CardTitle>
          <CardDescription>
            Categorize active depository holdings into specialized alpha strategies and save setups directly into your tracking Google Sheet layout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input 
              placeholder="Enter unique Strategy Name (e.g., Dividend Portfolio)" 
              value={newStrategyName} 
              onChange={(e) => setNewStrategyName(e.target.value)}
              className="max-w-md bg-white"
            />
            <Button onClick={handleAddStrategy} disabled={!newStrategyName.trim()} variant="default">
              <Plus className="h-4 w-4 mr-1.5" /> Initialize Strategy
            </Button>
            <Button onClick={handleSaveToGoogleSheet} disabled={strategies.length === 0 || isSavingToGoogleSheets} variant="outline" className="ml-auto border-blue-600 text-blue-700 hover:bg-blue-50">
              {isSavingToGoogleSheets ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save Structure to Sheet
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-6 mt-4">
            {strategies.map((strategy) => {
              const fin = strategyFinancialsMaps[strategy.id] || { holdings: [], investment: 0, current: 0, pnl: 0, pnlPercent: 0, sumCostPrice: 0, sumLtp: 0 };
              return (
                <div key={strategy.id} className="border rounded-xl p-4 bg-white shadow-2xs space-y-4">
                  <div className="flex justify-between items-start border-b pb-2 flex-wrap gap-2">
                    <div>
                      <h3 className="font-bold text-base text-slate-900">{strategy.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {strategy.symbols.map(sym => (
                          <Badge key={sym} variant="secondary" className="pl-2 pr-1 py-0.5 font-mono text-xs flex items-center gap-1">
                            {sym}
                            <button onClick={() => handleRemoveSymbolFromStrategy(strategy.id, sym)} className="text-slate-400 hover:text-red-500 font-bold ml-1 text-xs">×</button>
                          </Badge>
                        ))}
                        {strategy.symbols.length === 0 && <span className="text-xs text-muted-foreground italic">No tracked symbols mapped.</span>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Symbol (e.g. INFY)"
                        value={symbolInputs[strategy.id] || ''}
                        onChange={(e) => setSymbolInputs(prev => ({ ...prev, [strategy.id]: e.target.value }))}
                        className="w-44 h-8 text-xs font-mono uppercase"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSymbolToStrategy(strategy.id)}
                      />
                      <Button size="sm" variant="secondary" className="h-8" onClick={() => handleAddSymbolToStrategy(strategy.id)}>Add</Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 border-purple-500 text-purple-700 hover:bg-purple-50"
                        onClick={() => handleFetchGeminiInsights(strategy.id, strategy.name, fin.holdings)}
                        disabled={fin.holdings.length === 0 || strategy.isInsightLoading}
                      >
                        {strategy.isInsightLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <BrainCircuit className="h-3.5 w-3.5 mr-1" />}
                        Gemini AI Insights
                      </Button>
                    </div>
                  </div>

                  {/* ISOLATED FINANCIAL METRICS CARDS FOR EACH STRATEGY BUCKET */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50 p-2.5 rounded-lg border text-xs">
                    <div>
                      <span className="text-slate-400 block font-semibold uppercase text-xxs tracking-wider">Invested Value</span>
                      <p className="font-bold text-slate-800 font-mono">₹{fin.investment.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-semibold uppercase text-xxs tracking-wider">Current Value</span>
                      <p className="font-bold text-slate-800 font-mono">₹{fin.current.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-semibold uppercase text-xxs tracking-wider">Sum Cost Price</span>
                      <p className="font-bold text-slate-700 font-mono">₹{fin.sumCostPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-semibold uppercase text-xxs tracking-wider">Sum LTP</span>
                      <p className="font-bold text-slate-700 font-mono">₹{fin.sumLtp.toFixed(2)}</p>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <span className="text-slate-400 block font-semibold uppercase text-xxs tracking-wider">Net Return P&L</span>
                      <p className={`font-bold font-mono ${fin.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {fin.pnl >= 0 ? '+' : ''}₹{fin.pnl.toFixed(2)} ({fin.pnlPercent.toFixed(2)}%)
                      </p>
                    </div>
                  </div>

                  {/* STRATEGY SPECIFIC AI INSIGHTS BLOCK */}
                  {strategy.insights && (
                    <div className="p-3 bg-purple-50/40 border border-purple-100 rounded-lg text-xs text-slate-700 leading-relaxed whitespace-pre-line font-medium">
                      <div className="flex items-center gap-1 text-purple-900 font-bold mb-1">
                        <Lightbulb className="h-3.5 w-3.5 text-purple-600" /> Strategy AI Analysis
                      </div>
                      {strategy.insights}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* COLLAPSIBLE 1: SYSTEM CLOCKS METRICS */}
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setIsClocksExpanded(!isClocksExpanded)}>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold">System Synchronization Latency Matrix</CardTitle>
          </div>
          {isClocksExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </CardHeader>
        {isClocksExpanded && (
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-3 bg-slate-50 border rounded-lg flex items-center gap-3">
              <Laptop className="h-5 w-5 text-blue-500" />
              <div><p className="text-xxs text-muted-foreground uppercase font-bold tracking-wider">Browser Clock</p><p className="text-sm font-medium tabular-nums">{clientTime}</p></div>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg flex items-center gap-3">
              <Server className="h-5 w-5 text-purple-500" />
              <div><p className="text-xxs text-muted-foreground uppercase font-bold tracking-wider">App Server Time</p><p className="text-sm font-medium tabular-nums">{status?.serverTimestamp ? new Date(status.serverTimestamp).toLocaleString() : 'Synchronizing...'}</p></div>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg flex items-center gap-3">
              <Clock className="h-5 w-5 text-emerald-600" />
              <div><p className="text-xxs text-muted-foreground uppercase font-bold tracking-wider">Paytm Response Time</p><p className="text-sm font-medium tabular-nums text-emerald-800">{portfolio?.paytmApiTimestamp ? new Date(portfolio.paytmApiTimestamp).toLocaleString() : 'No connection established'}</p></div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* COLLAPSIBLE 2: CRYPTOGRAPHIC JWT CLAIMS INSPECTOR */}
      <Card className="border-purple-200 bg-purple-50/5">
        <CardHeader className="py-3 flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setIsJwtExpanded(!isJwtExpanded)}>
          <div className="flex items-center gap-2 text-purple-900">
            <Fingerprint className="h-4 w-4" />
            <CardTitle className="text-sm font-semibold">JWT Scoped Claims Cryptographic Inspector</CardTitle>
          </div>
          {isJwtExpanded ? <ChevronUp className="h-4 w-4 text-purple-400" /> : <ChevronDown className="h-4 w-4 text-purple-400" />}
        </CardHeader>
        {isJwtExpanded && (
          <CardContent className="pt-2">
            {activeJwtMeta ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-white border rounded-lg shadow-sm">
                  <span className="text-xs font-semibold text-purple-700 block mb-1">CLAIM: Issued At (iat)</span>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">{activeJwtMeta.iatStr ? new Date(activeJwtMeta.iatStr).toLocaleString() : 'N/A'}</p>
                </div>
                <div className="p-3 bg-white border rounded-lg shadow-sm">
                  <span className="text-xs font-semibold text-purple-700 block mb-1">CLAIM: Expires At (exp)</span>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">{activeJwtMeta.expStr ? new Date(activeJwtMeta.expStr).toLocaleString() : 'N/A'}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-2">Execute authentication credentials session maps to read claims metadata bounds.</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* COLLAPSIBLE 3: GATEWAY KEY STATUS MATRIX */}
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setIsStatusMatrixExpanded(!isStatusMatrixExpanded)}>
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold">Upstream Application Gateway Key Status Matrix</CardTitle>
          </div>
          {isStatusMatrixExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </CardHeader>
        {isStatusMatrixExpanded && (
          <CardContent className="pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatusIndicator ok={status?.apiKeyConfigured} label="API Key" subtext={status?.apiKeyConfigured ? 'Secured' : 'Missing'} />
              <StatusIndicator ok={status?.secretConfigured} label="API Secret" subtext={status?.secretConfigured ? 'Secured' : 'Missing'} />
              <StatusIndicator ok={status?.hasAccessToken} label="Session Scopes" subtext={status?.hasAccessToken ? 'Active Scoped Read Token' : 'OAuth Required'} />
              <StatusIndicator ok={!!portfolio} label="Data Pipeline" subtext={portfolio ? 'Synced' : 'Dormant'} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* DEEP INSIGHTS PANEL */}
      {portfolio?.insights && (
        <Card className="border-amber-200 bg-amber-50/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <Lightbulb className="h-5 w-5 text-amber-600" /> Deep Investment Allocation Summary (Gemini Analysis)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700 space-y-4 leading-relaxed whitespace-pre-line font-medium">
            {portfolio.insights}
          </CardContent>
        </Card>
      )}

      {/* MAIN DATA TERMINAL TABLE */}
      {portfolio && (
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-bold text-slate-800">Demat Depository Assets Layout Table</h2>
            </div>

            <ScrollArea className="h-[380px] rounded-md border">
              <Table>
                <TableHeader className="bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('trading_symbol')}>Symbol <ArrowUpDown className="h-3 w-3 inline ml-1" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('sector')}>Sector <ArrowUpDown className="h-3 w-3 inline ml-1" /></TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Cost Price</TableHead>
                    <TableHead className="text-right">LTP</TableHead>
                    <TableHead className="text-right">Current Value</TableHead>
                    <TableHead className="text-right">Absolute P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedHoldings.map((h, i) => (
                    <TableRow key={i} className="hover:bg-slate-50/60 transition-colors">
                      <TableCell className="font-bold text-slate-900">{h.trading_symbol}<span className="text-xxs text-slate-400 block font-normal">{h.exchange}</span></TableCell>
                      <TableCell><Badge variant="outline" className="text-slate-600 bg-slate-50">{h.sector}</Badge></TableCell>
                      <TableCell className="text-right font-medium font-mono">{h.quantity}</TableCell>
                      <TableCell className="text-right font-mono">₹{h.average_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold font-mono">₹{h.last_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-bold font-mono text-slate-800">₹{h.current_value.toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-bold font-mono ${h.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {h.pnl >= 0 ? '+' : ''}₹{h.pnl.toFixed(2)}
                        <span className="text-xxs block font-medium opacity-80">({h.pnl_percent.toFixed(2)}%)</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* TOTALS MATRIX CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 border-t pt-4 bg-slate-50/40 p-3 rounded-lg">
              <div className="p-3 bg-white border rounded-lg shadow-2xs">
                <span className="text-xxs font-bold tracking-wider text-slate-400 uppercase">Sum of Costs</span>
                <p className="text-lg font-bold font-mono text-slate-700 mt-0.5">₹{aggregatedTotals.sumCostPrice.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-white border rounded-lg shadow-2xs">
                <span className="text-xxs font-bold tracking-wider text-slate-400 uppercase">Sum of LTPs</span>
                <p className="text-lg font-bold font-mono text-slate-800 mt-0.5">₹{aggregatedTotals.sumLtp.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-white border rounded-lg shadow-2xs">
                <span className="text-xxs font-bold tracking-wider text-slate-400 uppercase">Absolute Net P&L</span>
                <p className={`text-lg font-bold font-mono mt-0.5 ${portfolio.totalPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ₹{portfolio.totalPnl.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-white border rounded-lg shadow-2xs">
                <span className="text-xxs font-bold tracking-wider text-slate-400 uppercase">Gross Return Velocity</span>
                <p className={`text-lg font-bold font-mono mt-0.5 ${portfolio.totalPnlPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {portfolio.totalPnlPercent.toFixed(2)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* INTERACTIVE INTERFACE PAYTM OAUTH TERMINAL TRIGGER BRIDGE */}
      {(needsAuth || !portfolio) && !isLoadingStatus && (
        <Card className="border-yellow-400/50 bg-yellow-50/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-yellow-500" />OAuth Session Handshake Required</CardTitle>
            <CardDescription>Renew read access token credentials to map active holdings and run portfolio calculations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={startOAuthFlow} className="w-full bg-slate-900 text-white hover:bg-slate-800" size="lg">
              <ExternalLink className="mr-2 h-4 w-4" /> Connect Scoped Paytm Money Session
            </Button>
          </CardContent>
        </Card>
      )}

      {portfolioError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Upstream Handshake Evaluation Fault</p>
              <p className="text-xs font-mono text-slate-600 mt-1 break-all">{portfolioError}</p>
              <div className="flex gap-2 mt-3">
                <Button variant="destructive" size="sm" onClick={startOAuthFlow}><RefreshCcw className="mr-2 h-3.5 w-3.5" />Re-authenticate Session</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
