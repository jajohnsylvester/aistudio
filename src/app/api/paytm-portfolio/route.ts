import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Logger utility
function log(level: 'INFO' | 'DEBUG' | 'ERROR' | 'WARN', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ timestamp, level, component: 'paytm-portfolio-api', message, ...(data && { data }) }));
}

// Paytm Money API configuration
const PAYTM_API_HOST = "https://developer.paytmmoney.com";
const PAYTM_LOGIN_URL = "https://login.paytmmoney.com/merchant-login";

const API_ROUTES: Record<string, string> = {
  access_token: "/accounts/v2/gettoken",
  user_details: "/accounts/v1/user/details",
  holdings: "/holdings/v1/get-user-holdings-data",
  holdings_value: "/holdings/v1/get-holdings-value",
  position: "/orders/v1/position",
  order_book: "/orders/v1/order-book",
};

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase not configured");
  return createClient(supabaseUrl, serviceRoleKey);
}

function getApiCredentials() {
  return {
    apiKey: process.env.PAYTM_MONEY_API_KEY,
    apiSecret: process.env.PAYTM_MONEY_SECRET,
  };
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    return JSON.parse(payload);
  } catch { return null; }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= (payload.exp * 1000 - 5 * 60 * 1000);
}

function getTokenExpiryTime(token: string): Date | null {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? new Date(payload.exp * 1000) : null;
}

async function getAccessTokenFromDB() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('paytm_access_tokens')
      .select('access_token, public_access_token, read_access_token')
      .eq('user_id', 'default')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return { accessToken: null, isExpired: true, expiresAt: null };

    return {
      accessToken: data.access_token,
      isExpired: isTokenExpired(data.access_token),
      expiresAt: getTokenExpiryTime(data.access_token),
    };
  } catch { return { accessToken: null, isExpired: true, expiresAt: null }; }
}

async function saveAccessTokenToDB(tokenData: { access_token: string; public_access_token?: string; read_access_token?: string }) {
  const supabase = getSupabaseClient();
  await supabase.from('paytm_access_tokens').update({ is_active: false }).eq('user_id', 'default');
  await supabase.from('paytm_access_tokens').insert({
    user_id: 'default',
    access_token: tokenData.access_token,
    public_access_token: tokenData.public_access_token || null,
    read_access_token: tokenData.read_access_token || null,
    is_active: true,
  });
}

function generateLoginUrl(apiKey: string, stateKey: string): string {
  return `${PAYTM_LOGIN_URL}?apiKey=${apiKey}&state=${stateKey}`;
}

async function exchangeRequestToken(apiKey: string, apiSecret: string, requestToken: string) {
  const response = await fetch(`${PAYTM_API_HOST}${API_ROUTES.access_token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, api_secret_key: apiSecret, request_token: requestToken }),
  });

  if (!response.ok) throw new Error(`Failed to get access token: ${response.status}`);

  const data = await response.json();
  if (data.access_token) await saveAccessTokenToDB(data);
  return data;
}

async function callPaytmAPI(endpoint: string, accessToken: string) {
  const response = await fetch(`${PAYTM_API_HOST}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 400) throw new Error('Access token expired. Please re-authenticate.');
    if (response.status === 401) throw new Error('Authentication failed. Please login again.');
    throw new Error(`Paytm API error: ${response.status}`);
  }

  return response.json();
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

interface PortfolioSummary {
  totalInvestment: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdings: Holding[];
}

async function generateInsights(portfolioData: PortfolioSummary): Promise<string> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) return 'Gemini API key not configured.';

  const prompt = `Analyze this stock portfolio:
Total Investment: ₹${portfolioData.totalInvestment?.toLocaleString() || 'N/A'}
Current Value: ₹${portfolioData.totalCurrentValue?.toLocaleString() || 'N/A'}
P&L: ₹${portfolioData.totalPnl?.toLocaleString() || 'N/A'} (${portfolioData.totalPnlPercent?.toFixed(2) || 'N/A'}%)
Holdings: ${portfolioData.holdings?.map(h => `${h.trading_symbol}: ${h.quantity} @ ₹${h.average_price} (Current: ₹${h.last_price})`).join(', ') || 'None'}
Provide brief analysis: diversification, top/bottom performers, risk, recommendations.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
    );
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate insights';
  } catch { return 'Unable to generate insights.'; }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const { apiKey, apiSecret } = getApiCredentials();

  try {
    if (action === 'status') {
      const tokenData = await getAccessTokenFromDB();
      return NextResponse.json({
        connected: !!(apiKey && apiSecret),
        hasAccessToken: !!tokenData.accessToken,
        tokenExpired: tokenData.isExpired,
        tokenExpiresAt: tokenData.expiresAt?.toISOString() || null,
        apiKeyConfigured: !!apiKey,
        secretConfigured: !!apiSecret,
        geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
        perplexityKeyConfigured: !!process.env.PERPLEXITY_API_KEY,
        timestamp: new Date().toISOString(),
      });
    }

    if (action === 'login_url') {
      if (!apiKey) return NextResponse.json({ error: 'API Key not configured' }, { status: 400 });
      const state = searchParams.get('state') || Date.now().toString();
      return NextResponse.json({ login_url: generateLoginUrl(apiKey, state), state_key: state });
    }

    if (action === 'exchange_token') {
      const requestToken = searchParams.get('request_token');
      if (!requestToken) return NextResponse.json({ error: 'request_token required' }, { status: 400 });
      if (!apiKey || !apiSecret) return NextResponse.json({ error: 'API credentials not configured' }, { status: 500 });
      const tokenData = await exchangeRequestToken(apiKey, apiSecret, requestToken);
      return NextResponse.json({ success: true, hasAccessToken: !!tokenData.access_token });
    }

    if (action === 'portfolio') {
      const tokenData = await getAccessTokenFromDB();
      if (!tokenData.accessToken) throw new Error('No access token found. Please authenticate.');
      if (tokenData.isExpired) throw new Error(`Token expired at ${tokenData.expiresAt?.toISOString()}. Please re-authenticate.`);

      const holdingsData = await callPaytmAPI(API_ROUTES.holdings, tokenData.accessToken);
      const rawHoldings = holdingsData?.data?.holdings || holdingsData?.holdings || [];

      const holdings: Holding[] = rawHoldings.map((h: any) => ({
        trading_symbol: h.trading_symbol || h.symbol || 'Unknown',
        exchange: h.exchange || 'NSE',
        quantity: h.quantity || h.qty || 0,
        average_price: h.average_price || h.avg_price || 0,
        last_price: h.last_price || h.ltp || 0,
        pnl: h.pnl || h.profit_loss || 0,
        pnl_percent: h.pnl_percent || h.change_percent || 0,
        current_value: (h.quantity * h.last_price) || 0,
        investment_value: (h.quantity * h.average_price) || 0,
      }));

      const totalInvestment = holdings.reduce((sum, h) => sum + h.investment_value, 0);
      const totalCurrentValue = holdings.reduce((sum, h) => sum + h.current_value, 0);
      const totalPnl = totalCurrentValue - totalInvestment;
      const totalPnlPercent = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

      const portfolio: PortfolioSummary = { totalInvestment, totalCurrentValue, totalPnl, totalPnlPercent, holdings };
      const insights = await generateInsights(portfolio);

      return NextResponse.json({ ...portfolio, insights, lastUpdated: new Date().toISOString() });
    }

    if (action === 'value') {
      const tokenData = await getAccessTokenFromDB();
      if (!tokenData.accessToken || tokenData.isExpired) throw new Error('Token required');
      return NextResponse.json(await callPaytmAPI(API_ROUTES.holdings_value, tokenData.accessToken));
    }

    if (action === 'user') {
      const tokenData = await getAccessTokenFromDB();
      if (!tokenData.accessToken || tokenData.isExpired) throw new Error('Token required');
      return NextResponse.json(await callPaytmAPI(API_ROUTES.user_details, tokenData.accessToken));
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    const isTokenExpired = error.message?.includes('expired') || error.message?.includes('authenticate');
    return NextResponse.json({ error: error.message, tokenExpired: isTokenExpired }, { status: isTokenExpired ? 503 : 500 });
  }
}
