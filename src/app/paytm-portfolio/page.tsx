'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Wallet, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Lightbulb, ExternalLink, Key, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MCPStatus {
  connected: boolean;
  hasAccessToken: boolean;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  geminiKeyConfigured?: boolean;
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
  oauthRequired?: boolean;
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
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Status check error:', error);
      setStatus({
        connected: false,
        hasAccessToken: false,
        apiKeyConfigured: false,
        secretConfigured: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const fetchPortfolio = useCallback(async () => {
    setIsLoadingPortfolio(true);
    try {
      const response = await fetch('/api/paytm-portfolio?action=portfolio');
      const data = await response.json();
      setPortfolio(data);

      if (data.oauthRequired) {
        toast({
          title: 'OAuth Required',
          description: 'Please login with Paytm Money to view your portfolio',
        });
      }
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
  }, [toast]);

  const startOAuthFlow = async () => {
    try {
      const response = await fetch('/api/paytm-portfolio?action=login_url');
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.login_url) {
        // Open login in new window - user will be redirected to callback
        window.open(data.login_url, '_blank');
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get login URL',
      });
    }
  };

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (status?.hasAccessToken) {
      fetchPortfolio();
    }
  }, [status?.hasAccessToken, fetchPortfolio]);

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
            Your stock holdings powered by Paytm Money API
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            checkStatus();
            if (status?.hasAccessToken) {
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

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Server Status
          </CardTitle>
          <CardDescription>
            Credentials are securely stored in Supabase secrets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingStatus ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  {status?.apiKeyConfigured ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium">API Key</p>
                    <p className={`text-xs ${status?.apiKeyConfigured ? 'text-green-600' : 'text-destructive'}`}>
                      {status?.apiKeyConfigured ? 'Secured' : 'Missing'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {status?.secretConfigured ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium">API Secret</p>
                    <p className={`text-xs ${status?.secretConfigured ? 'text-green-600' : 'text-destructive'}`}>
                      {status?.secretConfigured ? 'Secured' : 'Missing'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {status?.hasAccessToken ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Access Token</p>
                    <p className={`text-xs ${status?.hasAccessToken ? 'text-green-600' : 'text-yellow-600'}`}>
                      {status?.hasAccessToken ? 'Active' : 'OAuth Required'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {status?.geminiKeyConfigured ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Gemini AI</p>
                    <p className={`text-xs ${status?.geminiKeyConfigured ? 'text-green-600' : 'text-yellow-600'}`}>
                      {status?.geminiKeyConfigured ? 'Configured' : 'Optional'}
                    </p>
                  </div>
                </div>
              </div>

              {status?.apiKeyConfigured && status?.secretConfigured && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                  <Shield className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <p className="text-xs text-green-700 dark:text-green-400">
                    API credentials are securely stored in Supabase Edge Function secrets
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

      {/* Credentials Missing */}
      {status && (!status.apiKeyConfigured || !status.secretConfigured) && !isLoadingStatus && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Setup Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paytm Money API credentials need to be configured in Supabase secrets:
            </p>
            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
              <p className="font-medium">Add these secrets in Supabase Dashboard:</p>
              <ul className="ml-4 space-y-1 list-disc">
                <li><code>PAYTM_MONEY_API_KEY</code> - Your Paytm API key</li>
                <li><code>PAYTM_MONEY_SECRET</code> - Your Paytm API secret</li>
              </ul>
              <p className="text-muted-foreground text-xs mt-2">
                Dashboard: Project Settings → Edge Functions → Secrets Management
              </p>
            </div>
            <Button asChild>
              <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Supabase Dashboard
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* OAuth Required */}
      {status?.apiKeyConfigured && status?.secretConfigured && !status.hasAccessToken && !isLoadingStatus && (
        <Card className="border-yellow-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-yellow-500" />
              OAuth Authentication Required
            </CardTitle>
            <CardDescription>
              Connect your Paytm Money account to view your portfolio
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the button below to login with your Paytm Money account.
              After authentication, your access token will be securely stored.
            </p>
            <Button onClick={startOAuthFlow} className="w-full" size="lg">
              <ExternalLink className="mr-2 h-4 w-4" />
              Login with Paytm Money
            </Button>
            <div className="bg-muted p-3 rounded-lg text-xs text-muted-foreground">
              <p className="font-medium mb-1">How it works:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Click "Login with Paytm Money"</li>
                <li>Enter your Paytm Money credentials</li>
                <li>Access token is saved securely</li>
                <li>Your portfolio loads automatically</li>
              </ol>
            </div>
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Make sure your redirect URL in Paytm developer portal is set to: <code className="break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback</code>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Summary */}
      {status?.hasAccessToken && portfolio && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Investment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(portfolio.totalInvestment)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Current Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(portfolio.totalCurrentValue)}</div>
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
                <div className="text-2xl font-bold">{portfolio.holdings?.length || 0}</div>
                <p className="text-sm text-muted-foreground">stocks</p>
              </CardContent>
            </Card>
          </div>

          {/* AI Insights */}
          {status?.geminiKeyConfigured && portfolio.insights && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  AI Portfolio Insights
                </CardTitle>
                <CardDescription>Powered by Gemini AI</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <p className="whitespace-pre-wrap">{portfolio.insights}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Holdings Table */}
          <Card>
            <CardHeader>
              <CardTitle>Your Holdings</CardTitle>
              <CardDescription>Your stock portfolio from Paytm Money</CardDescription>
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
                          <TableCell className="font-medium">{holding.trading_symbol}</TableCell>
                          <TableCell><Badge variant="outline">{holding.exchange}</Badge></TableCell>
                          <TableCell className="text-right">{holding.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(holding.average_price)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(holding.last_price)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(holding.investment_value)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(holding.current_value)}</TableCell>
                          <TableCell className={`text-right font-medium ${holding.pnl >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                            <div>{formatCurrency(holding.pnl)}</div>
                            <div className="text-xs">{formatPercent(holding.pnl_percent)}</div>
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
    </div>
  );
}
