'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, RefreshCw, Wallet, TrendingUp, TrendingDown,
  AlertCircle, CheckCircle, Lightbulb, ExternalLink, Key,
  Shield, RefreshCcw, Server, Bot, Database, Zap, Clock, Laptop, Fingerprint
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface JwtMetadata {
  rawIat: number | null;
  rawExp: number | null;
  iatStr: string | null;
  expStr: string | null;
}

interface MCPStatus {
  connected: boolean;
  hasAccessToken: boolean;
  tokenExpired?: boolean;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  geminiKeyConfigured?: boolean;
  serverTimestamp?: string;
  jwtMeta?: JwtMetadata | null;
  tools?: string[];
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
      setStatus(await response.json());
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
      } else {
        setPortfolio(data);
      }
    } catch (error: any) {
      setPortfolioError(error.message);
    } finally {
      setIsLoadingPortfolio(false);
    }
  }, []);

  useEffect(() => {
    async function handleExchangeToken() {
      if (!requestToken) return;
      setIsLoadingPortfolio(true);
      try {
        const response = await fetch(`/api/paytm-portfolio?action=exchange_token&request_token=${encodeURIComponent(requestToken)}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Exchange failed');
        toast({ title: 'Success', description: 'Token mapped successfully.' });
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

  useEffect(() => { if (!requestToken) checkStatus(); }, [checkStatus, requestToken]);
  useEffect(() => { if (status?.hasAccessToken && !requestToken) fetchPortfolio(); }, [status?.hasAccessToken, fetchPortfolio, requestToken]);

  const activeJwtMeta = portfolio?.jwtMeta || status?.jwtMeta;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paytm Money Portfolio Terminal</h1>
          <p className="text-muted-foreground text-sm mt-1">Debugging cryptographic token lifetime bounds</p>
        </div>
        <Button variant="outline" onClick={() => { checkStatus(); fetchPortfolio(); }} disabled={isLoadingStatus || isLoadingPortfolio}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Synchronized Timeline Diagnostic Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 flex items-center gap-3"><Laptop className="h-5 w-5 text-blue-500" /><div><p className="text-xs text-muted-foreground font-medium">Browser Clock</p><p className="text-sm font-semibold tabular-nums">{clientTime}</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3"><Server className="h-5 w-5 text-purple-500" /><div><p className="text-xs text-muted-foreground font-medium">App Server Time</p><p className="text-sm font-semibold tabular-nums">{status?.serverTimestamp ? new Date(status.serverTimestamp).toLocaleString() : 'Loading...'}</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3"><Clock className="h-5 w-5 text-emerald-600" /><div><p className="text-xs text-muted-foreground font-medium">Paytm Response Time</p><p className="text-sm font-bold text-emerald-900 tabular-nums">{portfolio?.paytmApiTimestamp ? new Date(portfolio.paytmApiTimestamp).toLocaleString() : 'No Connection'}</p></div></CardContent></Card>
      </div>

      {/* JWT Structural Claim Breakdown */}
      <Card className="border-purple-200 bg-purple-50/10">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-purple-900"><Fingerprint className="h-4 w-4" />JWT Claims Inspector</CardTitle>
          <CardDescription>Validating Issued At (iat) and Expiration (exp) time claims directly from token payload</CardDescription>
        </CardHeader>
        <CardContent>
          {activeJwtMeta ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
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
        </CardContent>
      </Card>

      {/* Status Indicators */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatusIndicator ok={status?.apiKeyConfigured} label="API Key" subtext={status?.apiKeyConfigured ? 'Secured' : 'Missing'} />
            <StatusIndicator ok={status?.secretConfigured} label="API Secret" subtext={status?.secretConfigured ? 'Secured' : 'Missing'} />
            <StatusIndicator ok={status?.hasAccessToken && !portfolioError} label="Session State" subtext={status?.hasAccessToken && !portfolioError ? 'Active Token' : 'OAuth Required'} />
            <StatusIndicator ok={!!portfolio} label="Data Pipeline" subtext={portfolio ? 'Synced' : 'Dormant'} />
          </div>
        </CardContent>
      </Card>

      {/* Handle Errors */}
      {portfolioError && (
        <Card className="border-destructive/50 bg-destructive/5"><CardContent className="pt-4 flex gap-3"><AlertCircle className="h-5 w-5 text-destructive mt-0.5" /><div><p className="text-sm font-semibold text-destructive">Upstream Lifetime Fault Detected</p><p className="text-xs font-mono text-slate-600 mt-1">{portfolioError}</p><Button variant="destructive" size="sm" className="mt-3" onClick={() => { try { const res = fetch('/api/paytm-portfolio?action=login_url'); res.then(r => r.json()).then(d => { if(d.login_url) window.open(d.login_url, '_self'); }); } catch {} }}>Re-authenticate Session</Button></div></CardContent></Card>
      )}

      {/* Main Table Content */}
      {portfolio && (
        <Card>
          <CardContent className="pt-6">
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">LTP</TableHead><TableHead className="text-right">P&L</TableHead></TableRow></TableHeader>
                <TableBody>
                  {portfolio.holdings.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-semibold">{h.trading_symbol}</TableCell>
                      <TableCell className="text-right">{h.quantity}</TableCell>
                      <TableCell className="text-right">₹{h.last_price.toFixed(2)}</TableCell>
                      <TableCell className={`text-right ${h.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>{h.pnl_percent.toFixed(2)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PaytmPortfolioPage() {
  return <Suspense fallback={<div className="p-8"><Loader2 className="animate-spin" /></div>}><PaytmPortfolioContent /></Suspense>;
}
