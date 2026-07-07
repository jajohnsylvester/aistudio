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
  serverTimestamp?: string; // App Server Engine Time
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
  paytmApiTimestamp?: string; // Captured from Paytm Upstream Headers/Payload
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

  // Dynamically update client runtime clock to monitor real-time drifting
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
      } finally {
        setIsLoadingPortfolio(false);
      }
    }

    handleExchangeToken();
  }, [requestToken, router, checkStatus, toast]);

  useEffect(() => { 
    if (!requestToken) {
      checkStatus(); 
    }
  }, [checkStatus, requestToken]);

  useEffect(() => {
    if (status?.hasAccessToken && !status?.tokenExpired && !requestToken) fetchPortfolio();
  },
