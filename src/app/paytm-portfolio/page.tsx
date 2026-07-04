'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, RefreshCw, Wallet, TrendingUp, TrendingDown,
  AlertCircle, CheckCircle, Lightbulb, ExternalLink, Key,
  Shield, RefreshCcw, Server, Bot, Database, Zap,
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

export default function PaytmPortfolioPage() {
  const [status, setStatus] = useState<MCPStatus | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  const { toast } = useToast();

  const checkStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const response = await fetch('/api/paytm-mcp?action=status');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      setStatus({
        connected: false, hasAccessToken: false, tokenExpired: true,
        apiKeyConfigured: false, secretConfigured: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const fetchPortfolio = useCallback(async () => {
    setIsLoadingPortfolio(true);
    setPortfolioError(null);
    try {
      const response = await fetch('/api/paytm-agent?action=portfolio');
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

  const startOAuthFlow = async () => {
    try {
      const response = await fetch('/api/paytm-mcp?action=login_url');
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.login_url) window.open(data.login_url, '_blank');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : 'Failed to get login URL' });
    }
  };

  useEffect(() => { checkStatus(); }, [checkStatus]);

  useEffect(() => {
    if (status?.hasAccessToken && !status?.tokenExpired) fetchPortfolio();
  }, [status?.hasAccessToken, status?.tokenExpired, fetchPortfolio]);

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
            Powered by Google ADK + Gemini 2.5 Flash + Embedded Paytm MCP Server
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoadingStatus || isLoadingPortfolio}>
          {(isLoadingStatus || isLoadingPortfolio)
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Server Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4" />
            Server Status
          </CardTitle>
          <CardDescription>Credentials are securely stored as environment variables</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingStatus ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
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

              {status?.apiKeyConfigured && status?.secretConfigured && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/40 rounded-lg border border-green-200 dark:border-green-800">
                  <Shield className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <p className="text-xs text-green-700 dark:text-green-400">
                    API credentials are securely stored in application environment variables
                  </p>
                </div>
              )}

              {/* MCP Server info */}
              {status?.tools && status.tools.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Bot className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    MCP Server active with {status.tools.length} tools: {status.tools.join(', ')}
                  </p>
                </div>
              )}

              {status?.timestamp && (
                <p className="text-xs text-muted-foreground">
                  Last checked: {new Date(status.timestamp).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Missing Credentials */}
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
              <p>GEMINI_API_KEY=<span className="text-muted-foreground">your_gemini_key</span></p>
              <p>WEBSHARE_PROXY_URL=<span className="text-muted-foreground">optional_proxy_url</span></p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* OAuth Required / Token Expired */}
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
            {status?.tokenExpired && status?.tokenExpiresAt && (
              <div className="p-3 bg-orange-50 dark:bg-orange-950/40 rounded-lg border border-orange-200 dark:border-orange-800">
                <p className="text-xs text-orange-700 dark:text-orange-400">
                  Token expired at: {new Date(status.tokenExpiresAt).toLocaleString()}
                </p>
              </div>
            )}
            <Button onClick={startOAuthFlow} className="w-full" size="lg">
              <ExternalLink className="mr-2 h-4 w-4" />
              {status?.tokenExpired ? 'Re-authenticate with Paytm Money' : 'Login with Paytm Money'}
            </Button>
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Redirect URL for Paytm developer portal:{' '}
                <code className="break-all font-mono">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/paytm-portfolio/callback
                </code>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Error (token expired while viewing) */}
      {status?.hasAccessToken && portfolioError && !isLoadingPortfolio && (
        <Card className="border-orange-400/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              {isTokenError ? 'Session Expired' : 'Error Loading Portfolio'}
            </CardTitle>
            <CardDescription>
              {isTokenError
                ? 'Your access token may have expired. Please re-authenticate.'
                : 'Unable to fetch your portfolio data from Paytm Money.'}
            </CardDescription>
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
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800">
              <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-700 dark:text-blue-400">
                <p className="font-medium mb-1">Common causes:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Access token expired (valid for 24 hours)</li>
                  <li>Session invalidated from another device</li>
                  <li>API rate limit exceeded</li>
                  <li>Market is closed (try during market hours)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoadingPortfolio && (
        <div className="flex flex-col items-center justify-center py-14 gap-4">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <Bot className="h-5 w-5 text-primary/60 absolute inset-0 m-auto" />
          </div>
          <div className="text-center">
            <p className="text-muted-foreground font-medium">Fetching your portfolio...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Google ADK agent is calling Paytm Money MCP server
            </p>
          </div>
        </div>
      )}

      {/* Portfolio Data */}
      {status?.hasAccessToken && !status?.tokenExpired && portfolio && !portfolioError && (
        <>
          {/* Source badge */}
          {portfolio.source && (
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
          )}

          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Investment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(portfolio.totalInvestment)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Current Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(portfolio.totalCurrentValue)}</div>
              </CardContent>
            </Card>

            <Card className={portfolio.totalPnl >= 0 ? 'border-green-400/50' : 'border-destructive/50'}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  {portfolio.totalPnl >= 0
                    ? <TrendingUp className="h-4 w-4 text-green-500" />
                    : <TrendingDown className="h-4 w-4 text-destructive" />}
                  Profit / Loss
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${portfolio.totalPnl >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {formatCurrency(portfolio.totalPnl)}
                </div>
                <p className={`text-sm ${portfolio.totalPnl >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {formatPercent(portfolio.totalPnlPercent)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Database className="h-4 w-4" />
                  Holdings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{portfolio.holdings?.length || 0}</div>
                <p className="text-sm text-muted-foreground">stocks</p>
              </CardContent>
            </Card>
          </div>

          {/* AI Insights */}
          {portfolio.insights && (
            <Card className="border-amber-200/50 dark:border-amber-800/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  AI Portfolio Insights
                </CardTitle>
                <CardDescription>Generated by Google ADK agent using {portfolio.agentModel || 'Gemini 2.5 Flash'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{portfolio.insights}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Holdings Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Your Holdings
              </CardTitle>
              <CardDescription>
                Live portfolio from Paytm Money via embedded MCP server
              </CardDescription>
            </CardHeader>
            <CardContent>
              {portfolio.holdings?.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No holdings found in your portfolio.</p>
                </div>
              ) : (
                <ScrollArea className="h-[450px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Exchange</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Avg Price</TableHead>
                        <TableHead className="text-right">LTP</TableHead>
                        <TableHead className="text-right">Investment</TableHead>
                        <TableHead className="text-right">Current Value</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {portfolio.holdings?.map((h, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-semibold">{h.trading_symbol}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{h.exchange}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{h.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(h.average_price)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(h.last_price)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(h.investment_value)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(h.current_value)}</TableCell>
                          <TableCell className={`text-right font-medium tabular-nums ${h.pnl >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                            <div>{formatCurrency(h.pnl)}</div>
                            <div className="text-xs opacity-80">{formatPercent(h.pnl_percent)}</div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
              {portfolio.lastUpdated && (
                <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                  Last updated: {new Date(portfolio.lastUpdated).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
