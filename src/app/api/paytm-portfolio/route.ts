import { NextRequest, NextResponse } from 'next/server';

// Logger utility
function log(level: 'INFO' | 'DEBUG' | 'ERROR' | 'WARN', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    component: 'paytm-portfolio-api',
    message,
    ...(data && { data })
  };
  console.log(JSON.stringify(logEntry));
}

// MCP URL - credentials are stored in Supabase secrets
const PAYTM_MCP_URL = process.env.PAYTM_MCP_URL || 'https://kkzurvqbtguldcppujtn.supabase.co/functions/v1/paytm-mcp';

// Gemini API key is still needed locally for AI insights (or we can get it from environment)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

// Call MCP API (credentials are in Supabase secrets)
async function callMCPApi(action: string, params?: Record<string, string>): Promise<any> {
  log('INFO', `Calling MCP API: ${action}`);

  let url = `${PAYTM_MCP_URL}?action=${action}`;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url += `&${key}=${encodeURIComponent(value)}`;
    }
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MCP API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

// Call MCP tool
async function callMCPTool(toolName: string, args?: Record<string, any>): Promise<any> {
  log('INFO', `Calling MCP tool: ${toolName}`);

  const requestBody = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args || {},
    },
  };

  const response = await fetch(PAYTM_MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MCP call failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  const textContent = data.result?.content?.[0]?.text;
  if (textContent) {
    try {
      return JSON.parse(textContent);
    } catch {
      return { rawText: textContent };
    }
  }

  return data.result;
}

// Generate AI insights
async function generateInsights(portfolioData: PortfolioSummary): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'Gemini API key not configured. Add GEMINI_API_KEY to .env for AI insights.';
  }

  const prompt = `Analyze this stock portfolio and provide insights:

Total Investment: ₹${portfolioData.totalInvestment?.toLocaleString() || 'N/A'}
Current Value: ₹${portfolioData.totalCurrentValue?.toLocaleString() || 'N/A'}
Profit/Loss: ₹${portfolioData.totalPnl?.toLocaleString() || 'N/A'} (${portfolioData.totalPnlPercent?.toFixed(2) || 'N/A'}%)

Holdings:
${portfolioData.holdings?.map((h, i) =>
  `${i + 1}. ${h.trading_symbol}: ${h.quantity} shares @ ₹${h.average_price} (Current: ₹${h.last_price}, P&L: ₹${h.pnl?.toFixed(2)})`
).join('\n') || 'No holdings found'}

Provide a brief analysis including:
1. Portfolio diversification assessment
2. Top performers and underperformers
3. Risk assessment
4. Recommendations`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate insights';
  } catch (error) {
    log('ERROR', 'Gemini API error', { error: error instanceof Error ? error.message : String(error) });
    return 'Unable to generate insights at this time.';
  }
}

export async function GET(request: NextRequest) {
  const requestId = Date.now();
  log('INFO', 'GET request received', { requestId, url: request.url });

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Status check - credentials come from Supabase secrets
    if (action === 'status') {
      try {
        const status = await callMCPApi('status');
        return NextResponse.json({
          ...status,
          geminiKeyConfigured: !!GEMINI_API_KEY,
        });
      } catch (e) {
        return NextResponse.json({
          connected: false,
          hasAccessToken: false,
          apiKeyConfigured: false,
          secretConfigured: false,
          geminiKeyConfigured: !!GEMINI_API_KEY,
          error: e instanceof Error ? e.message : 'Failed to connect to MCP server',
        });
      }
    }

    // Get OAuth login URL
    if (action === 'login_url') {
      const state = searchParams.get('state') || Date.now().toString();
      try {
        const data = await callMCPApi('login_url', { state });
        return NextResponse.json(data);
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
      }
    }

    // Exchange request token for access token
    if (action === 'exchange_token') {
      const requestToken = searchParams.get('request_token');
      if (!requestToken) {
        return NextResponse.json({ error: 'request_token parameter required' }, { status: 400 });
      }

      try {
        const data = await callMCPApi('exchange_token', { request_token: requestToken });
        return NextResponse.json(data);
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
      }
    }

    // Get portfolio data
    if (action === 'portfolio') {
      log('INFO', 'Fetching portfolio data', { requestId });

      try {
        const holdingsData = await callMCPTool('get_holdings');
        log('INFO', 'Holdings data received', { requestId });

        const rawHoldings = holdingsData?.data?.holdings || holdingsData?.holdings || [];
        const holdings: Holding[] = rawHoldings.map((h: any) => ({
          trading_symbol: h.trading_symbol || h.symbol || h.pml_id || 'Unknown',
          exchange: h.exchange || 'NSE',
          quantity: h.quantity || h.qty || 0,
          average_price: h.average_price || h.avg_price || 0,
          last_price: h.last_price || h.ltp || 0,
          pnl: h.pnl || h.profit_loss || 0,
          pnl_percent: h.pnl_percent || h.change_percent || 0,
          current_value: (h.quantity * h.last_price) || h.current_value || h.valuation_price * h.quantity || 0,
          investment_value: (h.quantity * h.average_price) || h.investment_value || 0,
        }));

        const totalInvestment = holdings.reduce((sum, h) => sum + h.investment_value, 0);
        const totalCurrentValue = holdings.reduce((sum, h) => sum + h.current_value, 0);
        const totalPnl = totalCurrentValue - totalInvestment;
        const totalPnlPercent = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

        const portfolio: PortfolioSummary = {
          totalInvestment,
          totalCurrentValue,
          totalPnl,
          totalPnlPercent,
          holdings,
        };

        const insights = await generateInsights(portfolio);

        return NextResponse.json({
          ...portfolio,
          insights,
          lastUpdated: new Date().toISOString(),
        });
      } catch (mcpError: any) {
        log('ERROR', 'MCP Tool call error', { requestId, error: mcpError.message });
        return NextResponse.json({
          error: mcpError.message,
          oauthRequired: mcpError.message.includes('access token'),
        }, { status: mcpError.message.includes('access token') ? 503 : 500 });
      }
    }

    if (action === 'value') {
      const valueData = await callMCPTool('get_holdings_value');
      return NextResponse.json(valueData);
    }

    if (action === 'user') {
      const userData = await callMCPTool('get_user_details');
      return NextResponse.json(userData);
    }

    return NextResponse.json({
      error: 'Invalid action. Use: status, login_url, exchange_token, portfolio, value, or user',
    }, { status: 400 });

  } catch (error) {
    log('ERROR', 'Unhandled API error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }, { status: 500 });
  }
}
