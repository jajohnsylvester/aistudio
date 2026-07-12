'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, RefreshCw, AlertCircle, CheckCircle, Lightbulb, ExternalLink, Key,
  RefreshCcw, Server, Clock, Laptop, Fingerprint, Timer, ChevronDown, ChevronUp, ArrowUpDown
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
  return (
    <Suspense fallback={<div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto" /></div>}>
      <PaytmPortfolioContent />
    </Suspense>
  );
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

  // MCP Execution Console States
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [toolArguments, setToolArguments] = useState<string>('{}');
  const [mcpResult, setMcpResult] = useState<any>(null);
  const [isExecutingTool, setIsExecutingTool] = useState<boolean>(false);

  useEffect(() => {
    setClientTime(new Date().toLocaleString());
    const timer = setInterval(() => setClientTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // FIXED: Added missing OAuth Flow redirector logic
  const startOAuthFlow = () => {
    window.location.href = '/api/paytm-portfolio?action=login';
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
      
      if (statusData.tools && statusData.tools.length > 0) {
        setSelectedTool(prev => prev || statusData.tools![0].name);
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
    return {
      sumCostPrice,
      sumLtp,
      sumCalculatedPnl: sumLtp - sumCostPrice
    };
  }, [portfolio?.holdings]);

  const activeJwtMeta = portfolio?.jwtMeta || status?.jwtMeta;
  const needsAuth = status && status.apiKeyConfigured && status.secretConfigured && (!status.hasAccessToken || status.tokenExpired);

  return (
    <div className="flex flex-col gap-6 p-4 max-w-7xl mx-auto">
      {/* HEADER CONTROLS */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Paytm Money Portfolio Terminal</h1>
          <p className="text-muted-foreground text-sm mt-1">Debugging cryptographic token lifetime bounds</p>
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
                  <span className="text-xxs text-slate-400 block mt-0.5">Unix: {activeJwtMeta.rawIat}</span>
                </div>
                <div className="p-3 bg-white border rounded-lg shadow-sm">
                  <span className="text-xs font-semibold text-purple-700 block mb-1">CLAIM: Expires At (exp)</span>
                  <p className="text-sm font-bold text-slate-800 tabular-nums">{activeJwtMeta.expStr ? new Date(activeJwtMeta.expStr).toLocaleString() : 'N/A'}</p>
                  <span className="text-xxs text-slate-400 block mt-0.5">Unix: {activeJwtMeta.rawExp}</span>
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
              <div className="flex gap-2 text-xxs font-mono">
                {portfolio.agentModel && <Badge variant="secondary">{portfolio.agentModel}</Badge>}
                <Badge variant="outline">Sorted By: {sortField} ({sortDirection})</Badge>
              </div>
            </div>

            <ScrollArea className="h-[380px] rounded-md border">
              <Table>
                <TableHeader className="bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('trading_symbol')}>
                      <div className="flex items-center gap-1">Symbol <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort('sector')}>
                      <div className="flex items-center gap-1">Sector <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('quantity')}>
                      <div className="flex items-center justify-end gap-1">Qty <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('average_price')}>
                      <div className="flex items-center justify-end gap-1">Cost Price <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('last_price')}>
                      <div className="flex items-center justify-end gap-1">LTP <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('current_value')}>
                      <div className="flex items-center justify-end gap-1">Current Value <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort('pnl')}>
                      <div className="flex items-center justify-end gap-1">Absolute P&L <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
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

            {/* FINANCIAL TOTALS MATRIX CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 border-t pt-4 bg-slate-50/40 p-3 rounded-lg">
              <div className="p-3 bg-white border rounded-lg shadow-2xs">
                <span className="text-xxs font-bold tracking-wider text-slate-400 uppercase">Sum of Costs (Unit Base)</span>
                <p className="text-lg font-bold font-mono text-slate-700 mt-0.5">₹{aggregatedTotals.sumCostPrice.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-white border rounded-lg shadow-2xs">
                <span className="text-xxs font-bold tracking-wider text-slate-400 uppercase">Sum of LTPs (Unit Base)</span>
                <p className="text-lg font-bold font-mono text-slate-800 mt-0.5">₹{aggregatedTotals.sumLtp.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-white border rounded-lg shadow-2xs">
                <span className="text-xxs font-bold tracking-wider text-slate-400 uppercase">Absolute Net Valuation P&L</span>
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

      {/* NATIVE OAUTH FALLBACK */}
      {needsAuth && !isLoadingStatus && (
        <Card className="border-yellow-400/50 bg-yellow-50/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-yellow-500" />OAuth Handshake Session Expired</CardTitle>
            <CardDescription>Renew read access token privileges to sync active depository metrics.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={startOAuthFlow} className="w-full" size="lg"><ExternalLink className="mr-2 h-4 w-4" />Authorize Scoped Read Session</Button>
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
