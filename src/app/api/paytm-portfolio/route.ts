import { NextRequest, NextResponse } from 'next/server';
import {
  PAYTM_LOGIN_URL, API_ROUTES, MCP_TOOLS,
  getAccessTokenFromDB, saveAccessTokenToDB, callPaytmAPI, type Holding,
} from '@/lib/paytm-shared';

async function fetchHoldings(accessToken: string) {
  const holdingsRaw = await callPaytmAPI(API_ROUTES.holdings, accessToken);
  const rawHoldings = (holdingsRaw as { data?: { holdings?: unknown[] }; holdings?: unknown[] })?.data?.holdings ||
                       (holdingsRaw as { holdings?: unknown[] })?.holdings || [];

  return rawHoldings.map((h: Record<string, unknown>) => ({
    trading_symbol: (h.trading_symbol || h.symbol || h.pml_id || 'Unknown') as string,
    exchange: (h.exchange || 'NSE') as string,
    quantity: parseFloat((h.quantity || h.qty) as string) || 0,
    average_price: parseFloat((h.average_price || h.avg_price) as string) || 0,
    last_price: parseFloat((h.last_price || h.ltp) as string) || 0,
    pnl: parseFloat((h.pnl || h.profit_loss) as string) || 0,
    pnl_percent: parseFloat((h.pnl_percent || h.change_percent) as string) || 0,
  }));
}

async function generateInsights(holdings: Holding[], totalInvestment: number, totalCurrentValue: number, totalPnl: number, totalPnlPercent: number): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || holdings.length === 0) return '';

  const prompt = `Analyze this Paytm Money stock portfolio and provide insights:

Total Investment: ₹${totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
Current Value: ₹${totalCurrentValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
P&L: ₹${totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (${totalPnlPercent.toFixed(2)}%)

Holdings (${holdings.length}):
${holdings.slice(0, 15).map(h =>
  `- ${h.trading_symbol} (${h.exchange}): ${h.quantity} shares @ ₹${h.average_price.toFixed(2)} | LTP: ₹${h.last_price.toFixed(2)} | P&L: ₹${h.pnl.toFixed(2)} (${h.pnl_percent.toFixed(2)}%)`
).join('\n')}

Provide: 1) Diversification analysis 2) Top/bottom performers 3) Risk assessment 4) Recommendations. Under 250 words.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
        }),
      }
    );
    if (!response.ok) return '';
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch {
    return '';
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const apiKey = process.env.PAYTM_MONEY_API_KEY;
  const apiSecret = process.env.PAYTM_MONEY_SECRET;

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
        proxyConfigured: !!process.env.WEBSHARE_PROXY_URL,
        timestamp: new Date().toISOString(),
        tools: MCP_TOOLS.map(t => t.name),
      });
    }

    if (action === 'login_url') {
      if (!apiKey) return NextResponse.json({ error: 'PAYTM_MONEY_API_KEY not configured' }, { status: 400 });
      const state = searchParams.get('state') || Date.now().toString();
      return NextResponse.json({
        login_url: `${PAYTM_LOGIN_URL}?apiKey=${apiKey}&state=${state}`,
        state_key: state,
      });
    }

    if (action === 'exchange_token') {
      const requestToken = searchParams.get('request_token');
      if (!requestToken) return NextResponse.json({ error: 'request_token required' }, { status: 400 });
      if (!apiKey || !apiSecret) return NextResponse.json({ error: 'API credentials not configured' }, { status: 500 });

      const response = await fetch(`https://developer.paytmmoney.com${API_ROUTES.access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, api_secret_key: apiSecret, request_token: requestToken }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return NextResponse.json({ error: `Token exchange failed: ${errText}` }, { status: 500 });
      }

      const tokenData = await response.json();
      if ((tokenData as { access_token?: string }).access_token) {
        await saveAccessTokenToDB(tokenData as { access_token: string; public_access_token?: string; read_access_token?: string });
        return NextResponse.json({ success: true, hasAccessToken: true, message: 'Access token stored successfully' });
      }
      return NextResponse.json({ error: 'No access token in response' }, { status: 500 });
    }

    if (action === 'portfolio' || !action) {
      const tokenData = await getAccessTokenFromDB();
      if (!tokenData.accessToken) {
        return NextResponse.json({ error: 'No access token found. Please complete OAuth authentication.', oauthRequired: true }, { status: 401 });
      }
      if (tokenData.isExpired) {
        return NextResponse.json({
          error: `Access token expired at ${tokenData.expiresAt?.toISOString()}. Please re-authenticate.`, tokenExpired: true, oauthRequired: true
        }, { status: 401 });
      }

      const rawHoldings = await fetchHoldings(tokenData.accessToken);
      const holdings: Holding[] = rawHoldings.map(h => ({
        ...h,
        current_value: h.quantity * h.last_price,
        investment_value: h.quantity * h.average_price,
      }));

      const totalInvestment = holdings.reduce((s, h) => s + h.investment_value, 0);
      const totalCurrentValue = holdings.reduce((s, h) => s + h.current_value, 0);
      const totalPnl = totalCurrentValue - totalInvestment;
      const totalPnlPercent = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

      const insights = await generateInsights(holdings, totalInvestment, totalCurrentValue, totalPnl, totalPnlPercent);

      return NextResponse.json({
        holdings,
        totalInvestment,
        totalCurrentValue,
        totalPnl,
        totalPnlPercent,
        insights,
        agentModel: 'gemini-2.5-flash',
        lastUpdated: new Date().toISOString(),
        source: 'Paytm Money API + Gemini AI',
      });
    }

    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    const isTokenError = message.includes('expired') || message.includes('authenticate') || message.includes('token');
    return NextResponse.json({ error: message, tokenExpired: isTokenError, oauthRequired: isTokenError }, { status: isTokenError ? 401 : 500 });
  }
}
