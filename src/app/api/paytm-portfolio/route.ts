import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  PAYTM_LOGIN_URL, API_ROUTES, MCP_TOOLS,
  callPaytmAPI, logDebug, type Holding,
} from '@/lib/paytm-shared';

const COOKIE_NAME = 'paytm_read_access_token';
const CLOCK_TOLERANCE_SECONDS = 120;

/**
 * Decode JWT claims (iat and exp) without external packages.
 */
function decodeJwtTimestamps(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { iatStr: null, expStr: null, rawIat: null, rawExp: null };

    const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson);

    return {
      rawIat: payload.iat || null,
      rawExp: payload.exp || null,
      iatStr: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
      expStr: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
    };
  } catch {
    return { iatStr: null, expStr: null, rawIat: null, rawExp: null };
  }
}

/**
 * Check if a JWT token is expired based on its exp claim.
 */
function isJwtExpired(token: string): boolean {
  const meta = decodeJwtTimestamps(token);
  if (!meta.rawExp) return true;
  const expiryMs = meta.rawExp * 1000;
  const bufferMs = 5 * 60 * 1000;
  return Date.now() >= (expiryMs - bufferMs);
}

async function fetchHoldingsWithTime(readAccessToken: string): Promise<{ holdings: Holding[]; upstreamTime: string }> {
  try {
    const holdingsRaw = await callPaytmAPI(API_ROUTES.holdings, readAccessToken);
    const fallbackTime = new Date().toISOString();
    
    // FIX 1: Robust structural normalization to handle direct arrays vs object wrappers
    let rawHoldings: unknown[] = [];
    if (Array.isArray(holdingsRaw)) {
      rawHoldings = holdingsRaw;
    } else if (holdingsRaw && typeof holdingsRaw === 'object') {
      const anyRaw = holdingsRaw as Record<string, any>;
      if (Array.isArray(anyRaw.data)) {
        rawHoldings = anyRaw.data;
      } else if (anyRaw.data && Array.isArray(anyRaw.data.holdings)) {
        rawHoldings = anyRaw.data.holdings;
      } else if (Array.isArray(anyRaw.holdings)) {
        rawHoldings = anyRaw.holdings;
      }
    }

    logDebug('DEBUG', 'Raw holdings payload parsed', { count: rawHoldings.length });

    // FIX 2: Remap naming attributes to align exactly with Paytm's explicit documentation
    const mappedHoldings: Holding[] = rawHoldings.map((raw) => {
      const h = (raw || {}) as Record<string, unknown>;
      const quantity = parseFloat((h.quantity || h.qty) as string) || 0;
      const averagePrice = parseFloat((h.cost_price || h.average_price || h.avg_price) as string) || 0; // cost_price is official documentation field
      const lastPrice = parseFloat((h.last_traded_price || h.last_price || h.ltp) as string) || 0;  // last_traded_price is official documentation field
      
      const investmentValue = quantity * averagePrice;
      const currentValue = quantity * lastPrice;
      const calculatedPnl = currentValue - investmentValue;
      
      const pnl = typeof h.pnl !== 'undefined' ? parseFloat(h.pnl as string) : calculatedPnl;
      const pnlPercent = typeof h.pnl_percent !== 'undefined' 
        ? parseFloat(h.pnl_percent as string) 
        : (investmentValue > 0 ? (calculatedPnl / investmentValue) * 100 : 0);

      return {
        trading_symbol: (h.nse_symbol || h.bse_symbol || h.display_name || h.trading_symbol || 'Unknown') as string,
        exchange: (h.exchange || (h.nse_symbol ? 'NSE' : 'BSE')) as string,
        quantity,
        average_price: averagePrice,
        last_price: lastPrice,
        pnl,
        pnl_percent: pnlPercent,
        current_value: currentValue,
        investment_value: investmentValue,
      };
    });

    return {
      holdings: mappedHoldings,
      upstreamTime: (holdingsRaw as { responseDate?: string })?.responseDate || fallbackTime
    };
  } catch (error: any) {
    logDebug('ERROR', 'fetchHoldingsWithTime failed', { error: error.message });
    throw new Error(`Upstream API evaluation exception: ${error.message}`);
  }
}

async function generateInsightsWithGemini(
  holdings: Holding[],
  totalInvestment: number,
  totalCurrentValue: number,
  totalPnl: number,
  totalPnlPercent: number
): Promise<{ insights: string; agentModel: string }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return { insights: 'GEMINI_API_KEY not configured.', agentModel: 'none' };
  if (holdings.length === 0) return { insights: 'No holdings records to analyze.', agentModel: 'gemini-2.5-flash' };

  const prompt = `Analyze this portfolio brief: Investment ₹${totalInvestment}, Value ₹${totalCurrentValue}. Provide 3 short diagnostic observations.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await response.json();
    const insights = (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text || 'AI insights unavailable.';
    return { insights, agentModel: 'gemini-2.5-flash' };
  } catch {
    return { insights: 'Unable to parse AI insights.', agentModel: 'none' };
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(COOKIE_NAME);

  if (action === 'execute_mcp_tool') {
    if (!cookieToken?.value) {
      return NextResponse.json({ error: 'Unauthorized: Session missing' }, { status: 401 });
    }
    try {
      const body = await request.json();
      const { toolName, arguments: toolArgs } = body;

      const targetedTool = MCP_TOOLS.find(t => t.name === toolName);
      if (!targetedTool) {
        return NextResponse.json({ error: `Tool ${toolName} not defined in schema metadata bounds.` }, { status: 404 });
      }

      const resultPayload = await targetedTool.handler(toolArgs || {}, cookieToken.value);

      return NextResponse.json({
        success: true,
        toolResult: resultPayload,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'MCP execution pipeline failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Method not supported' }, { status: 405 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const apiKey = process.env.PAYTM_MONEY_API_KEY;
  const apiSecret = process.env.PAYTM_MONEY_SECRET;

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(COOKIE_NAME);

  try {
    // --- STATUS ---
    if (action === 'status') {
      const tokenValue = cookieToken?.value;
      const tokenExpired = tokenValue ? isJwtExpired(tokenValue) : true;
      const jwtMeta = tokenValue ? decodeJwtTimestamps(tokenValue) : null;

      const configuredRefreshInterval = process.env.PORTFOLIO_REFRESH_INTERVAL_SECONDS 
        ? parseInt(process.env.PORTFOLIO_REFRESH_INTERVAL_SECONDS, 10) 
        : 300;

      return NextResponse.json({
        connected: !!(apiKey && apiSecret),
        hasAccessToken: !!tokenValue,
        tokenExpired,
        apiKeyConfigured: !!apiKey,
        secretConfigured: !!apiSecret,
        geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
        proxyConfigured: !!process.env.WEBSHARE_PROXY_URL,
        serverTimestamp: new Date().toISOString(),
        jwtMeta,
        tools: MCP_TOOLS.map(t => ({
          name: t.name,
          description: t.description || 'No description provided.',
          inputSchema: (t as any).inputSchema || {}
        })),
        refreshIntervalSeconds: configuredRefreshInterval,
      });
    }

    // --- CLEAR TOKEN ---
    if (action === 'clear_token') {
      cookieStore.delete(COOKIE_NAME);
      return NextResponse.json({ success: true, message: 'Token cleared.' });
    }

    // --- LOGIN URL ---
    if (action === 'login_url') {
      if (!apiKey) return NextResponse.json({ error: 'PAYTM_MONEY_API_KEY not configured' }, { status: 400 });
      const state = searchParams.get('state') || Date.now().toString();
      return NextResponse.json({
        login_url: `${PAYTM_LOGIN_URL}?apiKey=${apiKey}&state=${state}`
      });
    }

    // --- EXCHANGE TOKEN ---
    if (action === 'exchange_token') {
      const requestToken = searchParams.get('request_token');
      if (!requestToken) return NextResponse.json({ error: 'Missing request_token' }, { status: 400 });
      if (!apiKey || !apiSecret) return NextResponse.json({ error: 'API credentials not configured' }, { status: 500 });

      const response = await fetch(`https://developer.paytmmoney.com${API_ROUTES.access_token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'openapi-client-src': 'sdk',
        },
        body: JSON.stringify({ api_key: apiKey, api_secret_key: apiSecret, request_token: requestToken }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({ error: `Handshake rejected: ${errorText}` }, { status: 500 });
      }

      const tokenData = await response.json();
      const readAccessToken = (tokenData as any).read_access_token;

      if (readAccessToken) {
        cookieStore.set(COOKIE_NAME, readAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 86400 - CLOCK_TOLERANCE_SECONDS,
          path: '/',
        });
        return NextResponse.json({ success: true, hasAccessToken: true });
      }
      return NextResponse.json({ error: 'No read-scoped access token payload returned' }, { status: 500 });
    }

    // --- PORTFOLIO ---
    if (action === 'portfolio' || !action) {
      if (!cookieToken || !cookieToken.value) {
        return NextResponse.json({ error: 'No access token found.', oauthRequired: true }, { status: 401 });
      }

      if (isJwtExpired(cookieToken.value)) {
        cookieStore.delete(COOKIE_NAME);
        return NextResponse.json({
          error: 'Access token expired. Please re-authenticate.',
          tokenExpired: true,
          oauthRequired: true,
        }, { status: 401 });
      }

      const { holdings, upstreamTime } = await fetchHoldingsWithTime(cookieToken.value);
      const totalInvestment = holdings.reduce((s, h) => s + h.investment_value, 0);
      const totalCurrentValue = holdings.reduce((s, h) => s + h.current_value, 0);
      const totalPnl = totalCurrentValue - totalInvestment;
      const totalPnlPercent = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

      const { insights, agentModel } = await generateInsightsWithGemini(
        holdings, totalInvestment, totalCurrentValue, totalPnl, totalPnlPercent
      );

      return NextResponse.json({
        holdings, totalInvestment, totalCurrentValue, totalPnl, totalPnlPercent,
        insights, agentModel,
        lastUpdated: new Date().toISOString(),
        paytmApiTimestamp: upstreamTime,
        jwtMeta: decodeJwtTimestamps(cookieToken.value),
        source: 'Paytm Money MCP Scoped Server',
      });
    }

    return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
  } catch (e: any) {
    const isTokenError = e.message.includes('expired') || e.message.includes('token') || e.message.includes('401');
    if (isTokenError) cookieStore.delete(COOKIE_NAME);
    return NextResponse.json({ error: e.message, tokenExpired: isTokenError, oauthRequired: isTokenError }, { status: isTokenError ? 401 : 500 });
  }
}
