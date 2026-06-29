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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PAYTM_API_KEY = process.env.PAYTM_MONEY_API_KEY;
const PAYTM_SECRET = process.env.PAYTM_MONEY_SECRET;
const PAYTM_ACCESS_TOKEN = process.env.PAYTM_ACCESS_TOKEN;
const PAYTM_MCP_URL = process.env.PAYTM_MCP_URL || 'https://kkzurvqbtguldcppujtn.supabase.co/functions/v1/paytm-mcp';

// Log environment status on module load
log('INFO', 'API route initialized', {
  hasGeminiKey: !!GEMINI_API_KEY,
  hasPaytmApiKey: !!PAYTM_API_KEY,
  hasPaytmSecret: !!PAYTM_SECRET,
  hasPaytmAccessToken: !!PAYTM_ACCESS_TOKEN,
  mcpUrl: PAYTM_MCP_URL,
});

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

async function callMCPApi(action: string, params?: Record<string, string>): Promise<any> {
  log('INFO', `Calling MCP API with action: ${action}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Pass API key and secret via headers
  if (PAYTM_API_KEY) {
    headers['X-Paytm-Api-Key'] = PAYTM_API_KEY;
  }
  if (PAYTM_SECRET) {
    headers['X-Paytm-Secret'] = PAYTM_SECRET;
  }
  if (PAYTM_ACCESS_TOKEN) {
    headers['X-Paytm-Access-Token'] = PAYTM_ACCESS_TOKEN;
  }

  let url = `${PAYTM_MCP_URL}?action=${action}`;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url += `&${key}=${encodeURIComponent(value)}`;
    }
  }

  log('DEBUG', 'MCP API request', { url, action });

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('ERROR', `MCP API failed with status ${response.status}`, { error: errorText });
    throw new Error(`MCP API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  log('DEBUG', 'MCP API response received', { action, hasError: !!data.error });

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

async function callMCPTool(toolName: string, args?: Record<string, any>): Promise<any> {
  log('INFO', `Calling MCP tool: ${toolName}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Pass all credentials via headers
  if (PAYTM_API_KEY) {
    headers['X-Paytm-Api-Key'] = PAYTM_API_KEY;
  }
  if (PAYTM_SECRET) {
    headers['X-Paytm-Secret'] = PAYTM_SECRET;
  }
  if (PAYTM_ACCESS_TOKEN) {
    headers['X-Paytm-Access-Token'] = PAYTM_ACCESS_TOKEN;
  }

  const requestBody = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args || {},
    },
  };

  log('DEBUG', 'MCP tool request', { tool: toolName });

  const response = await fetch(`${PAYTM_MCP_URL}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('ERROR', `MCP call failed with status ${response.status}`, { error: errorText });
    throw new Error(`MCP call failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.error) {
    log('ERROR', 'MCP tool returned error', { error: data.error });
    throw new Error(data.error.message);
  }

  // Parse the text content from MCP response
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

// Gemini API call for generating portfolio insights
async function generateInsights(portfolioData: PortfolioSummary): Promise<string> {
  log('INFO', 'Generating AI insights with Gemini');

  if (!GEMINI_API_KEY) {
    log('WARN', 'Gemini API key not configured');
    return 'Gemini API key not configured. Cannot generate insights.';
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

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });

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

    log('INFO', 'Processing request', { requestId, action });

    // Check connectivity status
    if (action === 'status') {
      const status = await callMCPApi('status');
      const response = {
        ...status,
        localApiKeyConfigured: !!PAYTM_API_KEY,
        localSecretConfigured: !!PAYTM_SECRET,
        localAccessTokenConfigured: !!PAYTM_ACCESS_TOKEN,
        geminiKeyConfigured: !!GEMINI_API_KEY,
      };
      return NextResponse.json(response);
    }

    // Get OAuth login URL
    if (action === 'login_url') {
      const state = searchParams.get('state') || Date.now().toString();
      const loginData = await callMCPApi('login_url', { state });
      return NextResponse.json(loginData);
    }

    // Exchange request token for access token
    if (action === 'exchange_token') {
      const requestToken = searchParams.get('request_token');
      if (!requestToken) {
        return NextResponse.json({ error: 'request_token parameter required' }, { status: 400 });
      }
      const tokenData = await callMCPApi('exchange_token', { request_token: requestToken });
      return NextResponse.json(tokenData);
    }

    // Get portfolio data from MCP server
    if (action === 'portfolio') {
      if (!PAYTM_ACCESS_TOKEN) {
        log('WARN', 'Access token not configured - OAuth required');
        return NextResponse.json({
          error: 'OAuth access token required. Please complete the OAuth flow first.',
          oauthRequired: true,
          instructions: [
            '1. Use ?action=login_url to get the OAuth login URL',
            '2. Visit the login URL and authenticate in browser',
            '3. After successful login, you will be redirected with request_token',
            '4. Use ?action=exchange_token&request_token=TOKEN to get access_token',
            '5. Set PAYTM_ACCESS_TOKEN in .env with the access_token',
          ],
        }, { status: 503 });
      }

      log('INFO', 'Fetching portfolio data', { requestId });

      try {
        const holdingsData = await callMCPTool('get_holdings');
        log('INFO', 'Holdings data received', { requestId });

        // Transform the data - handle different response structures
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

        log('INFO', 'Holdings transformed', { requestId, holdingCount: holdings.length });

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
      } catch (mcpError) {
        log('ERROR', 'MCP Tool call error', {
          requestId,
          error: mcpError instanceof Error ? mcpError.message : String(mcpError),
        });
        return NextResponse.json({
          error: mcpError instanceof Error ? mcpError.message : 'Failed to fetch portfolio data',
        }, { status: 500 });
      }
    }

    // Get holdings value
    if (action === 'value') {
      const valueData = await callMCPTool('get_holdings_value');
      return NextResponse.json(valueData);
    }

    // Get user details
    if (action === 'user') {
      const userData = await callMCPTool('get_user_details');
      return NextResponse.json(userData);
    }

    log('WARN', 'Invalid action requested', { requestId, action });
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
