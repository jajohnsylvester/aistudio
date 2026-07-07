import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  PAYTM_LOGIN_URL, API_ROUTES, MCP_TOOLS,
  callPaytmAPI, type Holding,
} from '@/lib/paytm-shared';

const COOKIE_NAME = 'paytm_access_token';
const CLOCK_TOLERANCE_SECONDS = 120;

/**
 * Helper to extract and decode JWT claims (iat and exp) without external packages.
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
    return { iatStr: 'Error parsing JWT', expStr: 'Error parsing JWT', rawIat: null, rawExp: null };
  }
}

async function fetchHoldingsWithTime(accessToken: string): Promise<{ holdings: any[]; upstreamTime: string }> {
  try {
    const holdingsRaw = await callPaytmAPI(API_ROUTES.holdings, accessToken);
    const fallbackTime = new Date().toISOString();
    const rawHoldings = (holdingsRaw as { data?: { holdings?: unknown[] }; holdings?: unknown[] })?.data?.holdings ||
                        (holdingsRaw as { holdings?: unknown[] })?.holdings || [];

    const mappedHoldings = rawHoldings.map((h: Record<string, unknown>) => ({
      trading_symbol: (h.trading_symbol || h.symbol || h.pml_id || 'Unknown') as string,
      exchange: (h.exchange || 'NSE') as string,
      quantity: parseFloat((h.quantity || h.qty) as string) || 0,
      average_price: parseFloat((h.average_price || h.avg_price) as string) || 0,
      last_price: parseFloat((h.last_price || h.ltp) as string) || 0,
      pnl: parseFloat((h.pnl || h.profit_loss) as string) || 0,
      pnl_percent: parseFloat((h.pnl_percent || h.change_percent) as string) || 0,
    }));

    return {
      holdings: mappedHoldings,
      upstreamTime: (holdingsRaw as { responseDate?: string })?.responseDate || fallbackTime
    };
  } catch (error: any) {
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

  try {
    if (action === 'status') {
      const jwtMeta = cookieToken?.value ? decodeJwtTimestamps(cookieToken.value) : null;
      return NextResponse.json({
        connected: !!(apiKey && apiSecret),
        hasAccessToken: !!cookieToken?.value,
        tokenExpired: false, 
        apiKeyConfigured: !!apiKey,
        secretConfigured: !!apiSecret,
        geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
        proxyConfigured: !!process.env.WEBSHARE_PROXY_URL,
        serverTimestamp: new Date().toISOString(),
        jwtMeta,
        tools: MCP_TOOLS.map(t => t.name),
      });
    }

    if (action === 'login_url') {
      if (!apiKey) return NextResponse.json({ error: 'PAYTM_MONEY_API_KEY not configured' }, { status: 400 });
      const state = searchParams.get('state') || Date.now().toString();
      return NextResponse.json({ 
        login_url: `${PAYTM_LOGIN_URL}?apiKey=${apiKey}&state=${state}` 
      });
    }

    if (action === 'exchange_token') {
      const requestToken = searchParams.get('request_token');
      if (!requestToken) return NextResponse.json({ error: 'Missing request_token' }, { status: 400 });
      if (!apiKey || !apiSecret) return NextResponse.json({ error: 'API credentials not configured' }, { status: 500 });

      const response = await fetch(`https://developer.paytmmoney.com${API_ROUTES.access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, api_secret_key: apiSecret, request_token: requestToken }),
      });

      if (!response.ok) {
        return NextResponse.json({ error: `Handshake rejected: ${await response.text()}` }, { status: 500 });
      }

      const tokenData = await response.json();
      const accessToken = (tokenData as any).access_token;
      
      if (accessToken) {
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

    if (action === 'portfolio' || !action) {
      if (!cookieToken || !cookieToken.value) {
        return NextResponse.json({ error: 'No access token found.', oauthRequired: true }, { status: 401 });
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
        source: 'Paytm Money MCP Server',
      });
    }

    return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
  } catch (e: any) {
    const isTokenError = e.message.includes('expired') || e.message.includes('token') || e.message.includes('401');
    if (isTokenError) cookieStore.delete(COOKIE_NAME);
    return NextResponse.json({ error: e.message, tokenExpired: isTokenError, oauthRequired: isTokenError }, { status: isTokenError ? 401 : 500 });
  }
}
