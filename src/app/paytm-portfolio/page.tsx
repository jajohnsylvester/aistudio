'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Wallet, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Lightbulb } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MCPStatus {
  connected: boolean;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  proxyConfigured: boolean;
  timestamp?: string;
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
  lastUpdated: string;
  error?: string;
}

export default function PaytmPortfolioPage() {
  const [status, setStatus] = useState<MCPStatus | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  const { toast } = useToast();

  const checkStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const response = await fetch('/api/paytm-portfolio?action=status');
      if (!response.ok) {
        throw new Error('Failed to check status');
      }
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Status check error:', error);
      setStatus({
        connected: false,
        apiKeyConfigured: false,
        secretConfigured: false,
        proxyConfigured: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const fetchPortfolio = useCallback(async () => {
    if (!status?.connected) {
      toast({
        variant: 'destructive',
        title: 'Not Connected',
        description: 'Paytm Money MCP server is not connected.',
      });
      return;
    }

    setIsLoadingPortfolio(true);
    try {
      const response = await fetch('/api/paytm-portfolio?action=portfolio');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch portfolio');
      }
      const data = await response.json();
      setPortfolio(data);
    } catch (error) {
      console.error('Portfolio fetch error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch portfolio data',
      });
    } finally {
      setIsLoadingPortfolio(false);
    }
  }, [status, toast]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (status?.connected) {
      fetchPortfolio();
    }
  }, [status?.connected, fetchPortfolio]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Paytm Money Portfolio
          </h1>
          <p className="text-muted-foreground">
            Your stock holdings powered by Paytm Money API via MCP
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            checkStatus();
            if (status?.connected) {
              fetchPortfolio();
            }
          }}
          disabled={isLoadingStatus || isLoadingPortfolio}
        >
          {(isLoadingStatus || isLoadingPortfolio) ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* MCP Connectivity Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            MCP Server Connectivity
          </CardTitle>
          <CardDescription>
            Paytm Money MCP server connection status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingStatus ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                {status?.connected ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">Server Status</p>
                  <p className={`text-xs ${status?.connected ? 'text-green-600' : 'text-destructive'}`}>
                    {status?.connected ? 'Connected' : 'Disconnected'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {status?.apiKeyConfigured ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
                <div>
                  <p className="text-sm font-medium">API Key</p>
                  <p className={`text-xs ${status?.apiKeyConfigured ? 'text-green-600' : 'text-yellow-600'}`}>
                    {status?.apiKeyConfigured ? 'Configured' : 'Not Set'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {status?.secretConfigured ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
                <div>
                  <p className="text-sm font-medium">API Secret</p>
                  <p className={`text-xs ${status?.secretConfigured ? 'text-green-600' : 'text-yellow-600'}`}>
                    {status?.secretConfigured ? 'Configured' : 'Not Set'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {status?.proxyConfigured ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
                <div>
                  <p className="text-sm font-medium">Proxy</p>
                  <p className={`text-xs ${status?.proxyConfigured ? 'text-green-600' : 'text-yellow-600'}`}>
                    {status?.proxyConfigured ? 'Configured' : 'Not Set'}
                  </p>
                </div>
              </div>
            </div>
          )}
          {status?.timestamp && (
            <p className="text-xs text-muted-foreground mt-4">
              Last checked: {new Date(status.timestamp).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Portfolio Summary */}
      {status?.connected && portfolio && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Investment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(portfolio.totalInvestment)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Current Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(portfolio.totalCurrentValue)}
                </div>
              </CardContent>
            </Card>

            <Card className={portfolio.totalPnl >= 0 ? 'border-green-500/50' : 'border-destructive/50'}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {portfolio.totalPnl >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  )}
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
                <CardTitle className="text-sm font-medium">Holdings Count</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {portfolio.holdings?.length || 0}
                </div>
                <p className="text-sm text-muted-foreground">stocks</p>
              </CardContent>
            </Card>
          </div>

          {/* AI Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                AI Portfolio Insights
              </CardTitle>
              <CardDescription>
                Powered by Gemini AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="whitespace-pre-wrap">{portfolio.insights}</p>
              </div>
            </CardContent>
          </Card>

          {/* Holdings Table */}
          <Card>
            <CardHeader>
              <CardTitle>Your Holdings</CardTitle>
              <CardDescription>
                Your stock portfolio from Paytm Money
              </CardDescription>
            </CardHeader>
            <CardContent>
              {portfolio.holdings?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No holdings found in your portfolio.</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
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
                      {portfolio.holdings?.map((holding, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {holding.trading_symbol}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{holding.exchange}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {holding.quantity}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(holding.average_price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(holding.last_price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(holding.investment_value)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(holding.current_value)}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${holding.pnl >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                            <div>{formatCurrency(holding.pnl)}</div>
                            <div className="text-xs">
                              {formatPercent(holding.pnl_percent)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
              {portfolio.lastUpdated && (
                <p className="text-xs text-muted-foreground mt-4">
                  Last updated: {new Date(portfolio.lastUpdated).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Loading State */}
      {isLoadingPortfolio && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      )}

      {/* Not Connected Message */}
      {status && !status.connected && !isLoadingStatus && (
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold">Unable to Connect</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mt-2">
              The Paytm Money MCP server is not connected. Please ensure the following environment variables are set:
            </p>
            <ul className="text-sm text-muted-foreground mt-4 space-y-1">
              <li><code>PAYTM_MONEY_API_KEY</code> - Your Paytm Money API Key</li>
              <li><code>PAYTM_MONEY_SECRET</code> - Your Paytm Money API Secret</li>
              <li><code>WEBSHARE_PROXY_URL</code> - Optional proxy URL</li>
              <li><code>GEMINI_API_KEY</code> - For AI insights</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
