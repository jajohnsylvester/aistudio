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
  proxyConfigured?: boolean;
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
  useEffect(() => { if (status?.hasAccessToken && !requestToken && !status?.tokenExpired) fetchPortfolio(); }, [status?.hasAccessToken, status?.tokenExpired, fetchPortfolio, requestToken]);

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
        <Button variant="outline" onClick={() => { checkStatus(); if(status?.hasAccessToken) fetchPortfolio(); }} disabled={isLoadingStatus || isLoadingPortfolio}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Clock Realtime Synchronization */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 flex items-center gap-3"><Laptop className="h-5 w-5 text-blue-500" /><div><p className="text-xs text-muted-foreground font-medium">Browser Clock</p><p className="text-sm font-semibold tabular-nums">{clientTime}</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3"><Server className="h-5 w-5 text-purple-500" /><div><p className="text-xs text-muted-foreground font-medium">App Server Time</p><p className="text-sm font-semibold tabular-nums">{status?.serverTimestamp ? new Date(status.serverTimestamp).toLocaleString() : 'Loading...'}</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3"><Clock className="h-5 w-5 text-emerald-600" /><div><p className="text-xs text-muted-foreground font-medium">Paytm Response Time</p><p className="text-sm font-bold text-emerald-900 tabular-nums">{portfolio?.paytmApiTimestamp ? new Date(portfolio.paytmApiTimestamp).toLocaleString() : 'No Connection'}</p></div></CardContent></Card>
      </div>

      {/* Cryptographic token inspector */}
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

      {/* System Status Matrix Indicators */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatusIndicator ok={status?.apiKeyConfigured} label="API Key" subtext={status?.apiKeyConfigured ? 'Secured' : 'Missing'} />
            <StatusIndicator ok={status?.secretConfigured} label="API Secret" subtext={status?.secretConfigured ? 'Secured' : 'Missing'} />
            <StatusIndicator ok={status?.hasAccessToken && !isTokenError} label="Session State" subtext={status?.hasAccessToken && !isTokenError ? 'Active Token' : 'OAuth Required'} />
            <StatusIndicator ok={!!portfolio} label="Data Pipeline" subtext={portfolio ? 'Synced' : 'Dormant'} />
          </div>
        </CardContent>
      </Card>

      {/* Missing configuration banner layout */}
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

      {/* RESTORED: Native authentication prompt layout */}
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

      {/* Handle Lifetime Errors */}
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

      {/* Holdings Display Grid Layout */}
      {portfolio && (
        <Card>
          <CardContent className="pt-6">
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

            <ScrollArea className="h-[350px]">
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
  return <Suspense fallback={<div className="p-8"><Loader2 className="animate-spin text-primary mx-auto h-8 w-8" /></div>}><PaytmPortfolioContent /></Suspense>;
}
