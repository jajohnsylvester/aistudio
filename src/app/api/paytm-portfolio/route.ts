import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  PAYTM_LOGIN_URL, API_ROUTES, MCP_TOOLS,
  callPaytmAPI, logDebug, type Holding,
} from '@/lib/paytm-shared';

const COOKIE_NAME = 'paytm_access_token';
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
 * Considers a 5-minute buffer to avoid edge-case failures.
 */
function isJwtExpired(token: string): boolean {
  const meta = decodeJwtTimestamps(token);
  if (!meta.rawExp) return true;
  const expiryMs = meta.rawExp * 1000;
  const bufferMs = 5 * 60 * 1000;
  return Date.now() >= (expiryMs - bufferMs);
}

async function fetchHoldingsWithTime(accessToken: string): Promise<{ holdings: Holding[]; upstreamTime: string }> {
  try {
    const holdingsRaw = await callPaytmAPI(API_ROUTES.holdings, accessToken);
    const fallbackTime = new Date().toISOString();
    const rawHoldings = (holdingsRaw as { data?: { holdings?: unknown[] }; holdings?: unknown[] })?.data?.holdings ||
                        (holdingsRaw as { holdings?: unknown[] })?.holdings || [];

    logDebug('DEBUG', 'Raw holdings payload', { count: rawHoldings.length });

    const mappedHoldings: Holding[] = rawHoldings.map((raw) => {
      const h = (raw || {}) as Record<string, unknown>;
      const quantity = parseFloat((h.quantity || h.qty) as string) || 0;
      const averagePrice = parseFloat((h.average_price || h.avg_price) as string) || 0;
      const lastPrice = parseFloat((h.last_price || h.ltp) as string) || 0;
      const pnl = parseFloat((h.pnl || h.profit_loss) as string) || 0;
      const pnlPercent = parseFloat((h.pnl_percent || h.change_percent) as string) || 0;
      const investmentValue = quantity * averagePrice;
      const currentValue = quantity * lastPrice;

      return {
        trading_symbol: (h.trading_symbol || h.symbol || h.pml_id || 'Unknown') as string,
        exchange: (h.exchange || 'NSE') as string,
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
  if (holdings.length === 0) return { insights: 'No holdings found.', agentModel: 'gemini-2.5-flash' };

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const apiKey = process.env.PAYTM_MONEY_API_KEY;
  const apiSecret = process.env.PAYTM_MONEY_SECRET;

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(COOKIE_NAME);

  logDebug('INFO', 'Paytm portfolio API request', { action, hasCookieToken: !!cookieToken?.value });

  try {
    // --- STATUS ---
    if (action === 'status') {
      const tokenValue = cookieToken?.value;
      const tokenExpired = tokenValue ? isJwtExpired(tokenValue) : true;
      const jwtMeta = tokenValue ? decodeJwtTimestamps(tokenValue) : null;

      logDebug('DEBUG', 'Status check', {
        hasToken: !!tokenValue,
        tokenExpired,
        exp: jwtMeta?.expStr,
      });

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
        tools: MCP_TOOLS.map(t => t.name),
        refreshIntervalSeconds: configuredRefreshInterval,
      });
    }

    // --- CLEAR TOKEN (clear cache on launch) ---
    if (action === 'clear_token') {
      logDebug('INFO', 'Clearing access token cookie');
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

      logDebug('INFO', 'Exchanging request token for access token');

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
        logDebug('ERROR', 'Token exchange rejected', { status: response.status, errorText });
        return NextResponse.json({ error: `Handshake rejected: ${errorText}` }, { status: 500 });
      }

      const tokenData = await response.json();
      const accessToken = (tokenData as any).access_token;

      if (accessToken) {
        logDebug('INFO', 'Access token obtained, setting cookie');
        cookieStore.set(COOKIE_NAME, accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 86400 - CLOCK_TOLERANCE_SECONDS,
          path: '/',
        });
        return NextResponse.json({ success: true, hasAccessToken: true });
      }
      return NextResponse.json({ error: 'No token returned' }, { status: 500 });
    }

    // --- PORTFOLIO ---
    if (action === 'portfolio' || !action) {
      if (!cookieToken || !cookieToken.value) {
        logDebug('WARN', 'Portfolio requested but no access token cookie found');
        return NextResponse.json({ error: 'No access token found.', oauthRequired: true }, { status: 401 });
      }

      if (isJwtExpired(cookieToken.value)) {
        logDebug('WARN', 'Access token is expired; clearing cookie and requesting re-auth');
        cookieStore.delete(COOKIE_NAME);
        return NextResponse.json({
          error: 'Access token expired. Please re-authenticate.',
          tokenExpired: true,
          oauthRequired: true,
        }, { status: 401 });
      }

      logDebug('INFO', 'Fetching holdings with valid token');
      const { holdings, upstreamTime } = await fetchHoldingsWithTime(cookieToken.value);
      const totalInvestment = holdings.reduce((s, h) => s + h.investment_value, 0);
      const totalCurrentValue = holdings.reduce((s, h) => s + h.current_value, 0);
      const totalPnl = totalCurrentValue - totalInvestment;
      const totalPnlPercent = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

      const { insights, agentModel } = await generateInsightsWithGemini(
        holdings, totalInvestment, totalCurrentValue, totalPnl, totalPnlPercent
      );

      logDebug('INFO', 'Portfolio fetched successfully', {
        holdingsCount: holdings.length,
        totalInvestment,
        totalCurrentValue,
      });

      return NextResponse.json({
        holdings, totalInvestment, totalCurrentValue, totalPnl, totalPnlPercent,
        insights, agentModel,
        lastUpdated: new Date().toISOString(),
        paytmApiTimestamp: upstreamTime,
        jwtMeta: decodeJwtTimestamps(cookieToken.value),
        source: 'Paytm Money MCP Server',
      });
    }

    return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
  } catch (e: any) {
    logDebug('ERROR', 'Unhandled error in paytm-portfolio route', { error: e.message, stack: e.stack });
    const isTokenError = e.message.includes('expired') || e.message.includes('token') || e.message.includes('401');
    if (isTokenError) cookieStore.delete(COOKIE_NAME);
    return NextResponse.json({ error: e.message, tokenExpired: isTokenError, oauthRequired: isTokenError }, { status: isTokenError ? 401 : 500 });
  }
}
