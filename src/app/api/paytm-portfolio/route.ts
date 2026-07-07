import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  PAYTM_LOGIN_URL, API_ROUTES, MCP_TOOLS,
  callPaytmAPI, type Holding,
} from '@/lib/paytm-shared';

const COOKIE_NAME = 'paytm_access_token';
const CLOCK_TOLERANCE_SECONDS = 30;

/**
 * Enhanced API caller fetching holdings data alongside upstream server header dates.
 */
async function fetchHoldingsWithTime(accessToken: string): Promise<{ holdings: any[]; upstreamTime: string }> {
  try {
    // callPaytmAPI abstractly fetches holdings data.
    const holdingsRaw = await callPaytmAPI(API_ROUTES.holdings, accessToken);
    
    // Fallback timestamp if the shared abstract fetcher strips raw response headers
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
  if (!geminiKey) {
    return { insights: 'GEMINI_API_KEY not configured. AI insights unavailable.', agentModel: 'none' };
  }

  if (holdings.length === 0) {
    return { insights: 'No holdings found in portfolio to analyze.', agentModel: 'gemini-2.5-flash' };
  }

  const prompt = `You are a financial portfolio analyst. Analyze this Paytm Money stock portfolio and provide insights:

Total Investment: ₹${totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
Current Value: ₹${totalCurrentValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
P&L: ₹${totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (${totalPnlPercent.toFixed(2)}%)

Holdings (${holdings.length}):
${holdings.slice(0, 20).map(h =>
  `- ${h.trading_symbol} (${h.exchange}): ${h.quantity} shares @ ₹${h.average_price.toFixed(2)} | LTP: ₹${h.last_price.toFixed(2)} | P&L: ₹${h.pnl.toFixed(2)} (${h.pnl_percent.toFixed(2)}%)`
).join('\n')}

Provide a concise analysis covering portfolio diversification, top/underperformers, and risk assessment under 300 words.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) {
      return { insights: `Gemini API error: ${response.status}`, agentModel: 'gemini-2.5-flash' };
    }

    const data = await response.json();
    const insights = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts?.[0]?.text || 'AI insights unavailable.';
    return { insights, agentModel: 'gemini-2.5-flash' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { insights: `Unable to generate AI insights: ${message}`, agentModel: 'none' };
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
      return NextResponse.json({
        connected: !!(apiKey && apiSecret),
        hasAccessToken: !!cookieToken?.value,
        tokenExpired: false, 
        tokenExpiresAt: null,
        apiKeyConfigured: !!apiKey,
        secretConfigured: !!apiSecret,
        geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
        proxyConfigured: !!process.env.WEBSHARE_PROXY_URL,
        serverTimestamp: new Date().toISOString(), // Tracks Hosting Application Container instances time context
        tools: MCP_TOOLS.map(t => t.name),
      });
    }

    if (action === 'login_url') {
      if (!apiKey) {
        return NextResponse.json({ error: 'PAYTM_MONEY_API_KEY not configured' }, { status: 400 });
      }
      const state = searchParams.get('state') || Date.now().toString();
      return NextResponse.json({
        login_url: `${PAYTM_LOGIN_URL}?apiKey=${apiKey}&state=${state}`,
        state_key: state,
      });
    }

    if (action === 'exchange_token') {
      const requestToken = searchParams.get('request_token');
      
      if (!requestToken) {
        return NextResponse.json({ error: 'Single-use request_token query parameter missing.' }, { status: 400 });
      }
      if (!apiKey || !apiSecret) {
        return NextResponse.json({ error: 'API credentials not configured' }, { status: 500 });
      }

      const response = await fetch(`https://developer.paytmmoney.com${API_ROUTES.access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          api_secret_key: apiSecret,
          request_token: requestToken,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return NextResponse.json({ error: `Token exchange failure. Upstream details: ${errText}` }, { status: 500 });
      }

      const tokenData = await response.json();
      const accessToken = (tokenData as { access_token?: string }).access_token;
      
      if (accessToken) {
        const targetExpiry = 86400 - CLOCK_TOLERANCE_SECONDS;

        cookieStore.set(COOKIE_NAME, accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: targetExpiry,
          path: '/',
        });

        return NextResponse.json({
          success: true,
          hasAccessToken: true,
          message: 'Access token securely persisted.',
        });
      }
      return NextResponse.json({ error: 'Missing token in response object structure.' }, { status: 500 });
    }

    if (action === 'portfolio' || !action) {
      if (!cookieToken || !cookieToken.value) {
        return NextResponse.json({
          error: 'No access token found. Please complete OAuth authentication.',
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
        holdings,
        totalInvestment,
        totalCurrentValue,
        totalPnl,
        totalPnlPercent,
        insights,
        agentModel,
        lastUpdated: new Date().toISOString(),
        paytmApiTimestamp: upstreamTime, // Sent back cleanly to client layout components
        source: 'Paytm Money MCP Server + Gemini AI',
      });
    }

    return NextResponse.json({ error: `Invalid action variant parameter: ${action}` }, { status: 400 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    const isTokenError = message.includes('expired') || message.includes('authenticate') || message.includes('token');
                         
    if (isTokenError) {
      cookieStore.delete(COOKIE_NAME);
    }

    return NextResponse.json({
      error: message,
      tokenExpired: isTokenError,
      oauthRequired: isTokenError,
    }, { status: isTokenError ? 401 : 500 });
  }
}
