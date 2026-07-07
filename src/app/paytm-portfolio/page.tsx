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
  Shield, RefreshCcw, Server, Bot, Database, Zap, Clock, Laptop
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MCPStatus {
  connected: boolean;
  hasAccessToken: boolean;
  tokenExpired?: boolean;
  tokenExpiresAt?: string | null;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  geminiKeyConfigured?: boolean;
  proxyConfigured?: boolean;
  timestamp?: string;
  tools?: string[];
  error?: string;
  serverTimestamp?: string;
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
  error?: string;
  oauthRequired?: boolean;
  tokenExpired?: boolean;
}

function StatusIndicator({ ok, label, subtext, warn = false }: {
  ok: boolean | undefined;
  label: string;
  subtext: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {ok ? (
        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
      ) : warn ? (
        <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
      ) : (
        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
      )}
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className={`text-xs mt-0.5 ${ok ? 'text-green-600 dark:text-green-400' : warn ? 'text-yellow-600 dark:text-yellow-400' : 'text-destructive'}`}>
          {subtext}
        </p>
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
    const timer = setInterval(() => {
      setClientTime(new Date().toLocaleString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const checkStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const response = await fetch('/api/paytm-portfolio?action=status', {
        credentials: 'include',
      });
      const data = await response.json();
      setStatus(data);
    } catch {
      setStatus({
        connected: false, hasAccessToken: false, tokenExpired: true,
        apiKeyConfigured: false, secretConfigured: false,
        error: 'Failed to retrieve connection matrix configuration settings.',
      });
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const fetchPortfolio = useCallback(async () => {
    setIsLoadingPortfolio(true);
    setPortfolioError(null);
    try {
      const response = await fetch('/api/paytm-portfolio?action=portfolio', {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.error) {
        setPortfolioError(data.error);
        setPortfolio(null);
        if (!data.oauthRequired) {
          toast({ variant: 'destructive', title: 'Error Loading Portfolio', description: data.error });
        }
      } else {
        setPortfolio(data);
        setPortfolioError(null);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch portfolio';
      setPortfolioError(msg);
      setPortfolio(null);
      toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
      setIsLoadingPortfolio(false);
    }
  }, [toast]);

  useEffect(() => {
    async function handleExchangeToken() {
      if (!requestToken) return;

      setIsLoadingPortfolio(true);
      try {
        const response = await fetch(
          `/api/paytm-portfolio?action=exchange_token&request_token=${encodeURIComponent(requestToken)}`,
          {
            method: 'GET',
            credentials: 'include',
          }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Authentication token exchange lifecycle failed.');
        }

        toast({ title: 'Authentication Successful', description: 'Access token saved securely via cookie layers.' });
        router.replace('/paytm-portfolio');
        checkStatus();
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Exchange Error', description: error.message });
      } {
        setIsLoadingPortfolio(false);
      }
    }

    handleExchangeToken();
  }, [requestToken, router, checkStatus, toast]);

  const startOAuthFlow = async () => {
    try {
      const response = await fetch('/api/paytm-portfolio?action=login_url', { credentials: 'include' });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.login_url) window.open(data.login_url, '_self');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'Failed to get login URL' });
    }
  };

  useEffect(() => { 
    if (!requestToken) {
      checkStatus(); 
    }
  }, [checkStatus, requestToken]);

  useEffect(() => {
    if (status?.hasAccessToken && !status?.tokenExpired && !requestToken) fetchPortfolio();
  }, [status?.hasAccessToken, status?.tokenExpired, fetchPortfolio, requestToken]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);

  const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  const isTokenError = portfolioError?.includes('expired') ||
                       portfolioError?.includes('token') ||
                       portfolioError?.includes('authenticate') ||
                       portfolioError?.includes('401') ||
                       portfolioError?.includes('400');

  const needsAuth = status && status.apiKeyConfigured && status.secretConfigured &&
                    (!status.hasAccessToken || status.tokenExpired);

  const handleRefresh = () => {
    checkStatus();
    if (status?.hasAccessToken && !status?.tokenExpired) fetchPortfolio();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paytm Money Portfolio</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Powered by Gemini 2.5 Flash + Embedded Paytm MCP Server
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoadingStatus || isLoadingPortfolio}>
          {(isLoadingStatus || isLoadingPortfolio)
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Clock Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-4 flex items-center gap-3">
            <Laptop className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Your Local Browser Time</p>
              <p className="text-sm font-semibold text-slate-800 tabular-nums">{clientTime || 'Synchronizing...'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-4 flex items-center gap-3">
            <Server className="h-5 w-5 text-purple-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">App Server Time</p>
              <p className="text-sm font-semibold text-slate-800 tabular-nums">
                {status?.serverTimestamp ? new Date(status.serverTimestamp).toLocaleString() : 'Offline / Checking...'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/20 shadow-sm">
          <CardContent className="pt-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-emerald-700 font-medium uppercase tracking-wider">Paytm Money Server Time</p>
              <p className="text-sm font-bold text-emerald-900 tabular-nums">
                {portfolio?.paytmApiTimestamp ? new Date(portfolio.paytmApiTimestamp).toLocaleString('en-IN') : 'No Active Session'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Verification card matrix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-slate-500" />
            System Verification Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingStatus ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatusIndicator
                  ok={status?.apiKeyConfigured}
                  label="API Key"
                  subtext={status?.apiKeyConfigured ? 'Secured' : 'Missing'}
                />
                <StatusIndicator
                  ok={status?.secretConfigured}
                  label="API Secret"
                  subtext={status?.secretConfigured ? 'Secured' : 'Missing'}
                />
                <StatusIndicator
                  ok={status?.hasAccessToken && !status?.tokenExpired}
                  warn={!status?.hasAccessToken || status?.tokenExpired}
                  label="Access Token"
                  subtext={
                    status?.hasAccessToken && !status?.tokenExpired ? 'Active' :
                    status?.hasAccessToken && status?.tokenExpired ? 'Expired' : 'OAuth Required'
                  }
                />
                <StatusIndicator
                  ok={status?.geminiKeyConfigured}
                  warn={!status?.geminiKeyConfigured}
                  label="Gemini AI"
                  subtext={status?.geminiKeyConfigured ? 'Configured' : 'Optional'}
                />
              </div>

              {status?.tools && status.tools.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Bot className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    MCP Server active with {status.tools.length} tools: {status.tools.join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Missing configuration card layout */}
      {status && (!status.apiKeyConfigured || !status.secretConfigured) && !isLoadingStatus && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Setup Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Set the following environment variables:</p>
            <div className="bg-muted rounded-lg p-3 font-mono text-xs space-y-1">
              <p>PAYTM_MONEY_API_KEY=<span className="text-muted-foreground">your_api_key</span></p>
              <p>PAYTM_MONEY_SECRET=<span className="text-muted-foreground">your_api_secret</span></p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Re-authenticate setup module */}
      {needsAuth && !isLoadingStatus && (
        <Card className={`${status?.tokenExpired ? 'border-orange-400/50' : 'border-yellow-400/50'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className={`h-5 w-5 ${status?.tokenExpired ? 'text-orange-500' : 'text-yellow-500'}`} />
              {status?.tokenExpired ? 'Session Expired' : 'Authentication Required'}
            </CardTitle>
            <CardDescription>
              {status?.tokenExpired
                ? 'Your access token has expired. Please re-authenticate to continue.'
                : 'Connect your Paytm Money account to view your portfolio.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={startOAuthFlow} className="w-full" size="lg">
              <ExternalLink className="mr-2 h-4 w-4" />
              {status?.tokenExpired ? 'Re-authenticate with Paytm Money' : 'Login with Paytm Money'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Internal response code errors handle component */}
      {status?.hasAccessToken && portfolioError && !isLoadingPortfolio && (
        <Card className="border-orange-400/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              {isTokenError ? 'Session Expired' : 'Error Loading Portfolio'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs font-medium mb-1">Error details:</p>
              <p className="text-xs font-mono text-muted-foreground break-all">{portfolioError}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={startOAuthFlow} className="flex-1" disabled={isLoadingPortfolio}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Re-authenticate
              </Button>
              <Button variant="outline" onClick={fetchPortfolio} disabled={isLoadingPortfolio}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state rendering element */}
      {isLoadingPortfolio && (
        <div className="flex flex-col items-center justify-center py-14 gap-4">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <Bot className="h-5 w-5 text-primary/60 absolute inset-0 m-auto" />
          </div>
          <p className="text-muted-foreground font-medium">Fetching portfolio payload...</p>
        </div>
      )}

      {/* Core Portfolio Elements Matrix */}
      {status?.hasAccessToken && !status?.tokenExpired && portfolio && !portfolioError && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 border p-3 rounded-xl">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1.5 py-1">
                <Bot className="h-3 w-3" />
                {portfolio.source}
              </Badge>
              {portfolio.agentModel && (
                <Badge variant="outline" className="flex items-center gap-1.5 py-1">
                  <Zap className="h-3 w-3" />
                  {portfolio.agentModel}
                </Badge>
              )}
            </div>
            {portfolio.paytmApiTimestamp && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-md">
                <Clock className="h-3.5 w-3.5" />
                <span>Paytm API Response Time: <strong>{new Date(portfolio.paytmApiTimestamp).toLocaleString('en-IN')}</strong></span>
              </div>
