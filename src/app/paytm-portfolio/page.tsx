'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface Holding {
  trading_symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  current_value: number;
  investment_value: number;
  pnl: number;
  pnl_percent: number;
}

interface PortfolioState {
  holdings: Holding[];
  totalInvestment: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  insights: string;
  agentModel: string;
  lastUpdated?: string;
}

export default function PaytmPortfolioDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestToken = searchParams.get('request_token');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [oauthRequired, setOauthRequired] = useState<boolean>(false);
  const [portfolio, setPortfolio] = useState<PortfolioState | null>(null);

  // 1. Fetch current portfolio data using HttpOnly Cookies
  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/paytm-portfolio?action=portfolio', {
        method: 'GET',
        credentials: 'include', // CRITICAL: Permits the browser to automatically map HttpOnly cookies
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 401 || result.oauthRequired) {
          setOauthRequired(true);
        }
        throw new Error(result.error || 'Failed to sync portfolio metrics.');
      }

      setPortfolio(result);
      setOauthRequired(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Perform initial Request Token exchange & instantly scrub the URL query parameters
  useEffect(() => {
    async function performTokenExchange() {
      if (!requestToken) {
        // No authentication token pending execution, just pull portfolio straight up
        loadPortfolio();
        return;
      }

      setLoading(true);
      setError('Exchanging authentication token, checking clock drift profiles...');

      try {
        const response = await fetch(
          `/api/paytm-portfolio?action=exchange_token&request_token=${encodeURIComponent(requestToken)}`,
          { 
            method: 'GET',
            credentials: 'include' // Captures the returned token from Set-Cookie matrix
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'OAuth verification lifecycle rejected.');
        }

        // Token execution succeeded! Wipe parameter states immediately out of browser bar
        router.replace('/paytm-portfolio');
        
        // Re-pull live portfolio metrics safely using our clean cookie payload
        loadPortfolio();
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }

    performTokenExchange();
  }, [requestToken, loadPortfolio, router]);

  // 3. Helper to initialize OAuth login flow configuration
  const handleInitiateLogin = async () => {
    try {
      const response = await fetch('/api/paytm-portfolio?action=login_url', { method: 'GET' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      
      // Redirect out to Paytm Money validation terminal
      window.location.href = result.login_url;
    } catch (err: any) {
      setError(`Could not fetch OAuth routing schema: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <h2 className="text-xl font-bold animate-pulse text-slate-700">Synchronizing Application Layout...</h2>
        <p className="text-sm text-slate-500">{error || 'Checking encrypted contextual cookies...'}</p>
      </div>
    );
  }

  if (oauthRequired) {
    return (
      <div className="p-8 max-w-md mx-auto my-12 text-center border rounded-xl shadow-sm bg-white space-y-6">
        <h2 className="text-xl font-bold text-slate-900">Paytm Money Session Expired</h2>
        <p className="text-sm text-slate-600">
          We need to renew our daily verification contract with Paytm Money API servers to securely stream holdings.
        </p>
        {error && <p className="text-xs text-red-500 bg-red-50 p-2 rounded">{error}</p>}
        <button
          onClick={handleInitiateLogin}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 transition"
        >
          Authenticate Daily Session
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Banner metrics overview */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paytm Money Portfolio Dashboard</h1>
          <p className="text-xs text-slate-500">Source Framework: {portfolio?.source || 'Loading...'}</p>
        </div>
        <button
          onClick={loadPortfolio}
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium py-1.5 px-4 rounded-md border transition"
        >
          Refresh Data
        </button>
      </div>

      {error && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md">
          {error}
        </div>
      )}

      {portfolio && (
        <>
          {/* Key Portfolio Summaries Card Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg bg-slate-50/50">
              <span className="text-xs text-slate-500 block">Total Investment</span>
              <span className="text-lg font-bold text-slate-900">₹{portfolio.totalInvestment.toLocaleString('en-IN')}</span>
            </div>
            <div className="p-4 border rounded-lg bg-slate-50/50">
              <span className="text-xs text-slate-500 block">Current Value</span>
              <span className="text-lg font-bold text-slate-900">₹{portfolio.totalCurrentValue.toLocaleString('en-IN')}</span>
            </div>
            <div className="p-4 border rounded-lg bg-slate-50/50">
              <span className="text-xs text-slate-500 block">Net P&L</span>
              <span className={`text-lg font-bold ${portfolio.totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ₹{portfolio.totalPnl.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="p-4 border rounded-lg bg-slate-50/50">
              <span className="text-xs text-slate-500 block">Return Percent</span>
              <span className={`text-lg font-bold ${portfolio.totalPnlPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {portfolio.totalPnlPercent.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* AI Insights Card */}
          <div className="p-5 border border-purple-100 bg-purple-50/30 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-purple-700">
              <span>AI STRUCTURAL ANALYTICS</span>
              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded">{portfolio.agentModel}</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{portfolio.insights}</p>
          </div>

          {/* Table Data Matrix */}
          <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500 uppercase border-b">
                <tr>
                  <th className="p-4">Symbol</th>
                  <th className="p-4 text-right">Qty</th>
                  <th className="p-4 text-right">Avg Price</th>
                  <th className="p-4 text-right">LTP</th>
                  <th className="p-4 text-right">Current Value</th>
                  <th className="p-4 text-right">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {portfolio.holdings.map((h, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-4 font-semibold text-slate-900">
                      {h.trading_symbol} <span className="text-xxs font-normal text-slate-400">({h.exchange})</span>
                    </td>
                    <td className="p-4 text-right">{h.quantity}</td>
                    <td className="p-4 text-right">₹{h.average_price.toFixed(2)}</td>
                    <td className="p-4 text-right">₹{h.last_price.toFixed(2)}</td>
                    <td className="p-4 text-right font-medium">₹{h.current_value.toLocaleString('en-IN')}</td>
                    <td className={`p-4 text-right font-medium ${h.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {h.pnl_percent.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
