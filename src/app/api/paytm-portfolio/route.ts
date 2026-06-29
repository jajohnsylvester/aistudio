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
const PAYTM_MCP_URL = process.env.PAYTM_MCP_URL || 'https://kkzurvqbtguldcppujtn.supabase.co/functions/v1/paytm-mcp';

// Log environment status on module load
log('INFO', 'API route initialized', {
  hasGeminiKey: !!GEMINI_API_KEY,
  hasPaytmApiKey: !!PAYTM_API_KEY,
  hasPaytmSecret: !!PAYTM_SECRET,
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

async function getMCPStatus(): Promise<any> {
  log('INFO', 'Checking MCP server status');
  try {
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

    log('DEBUG', 'Status request headers', {
      hasXPaytmApiKey: !!headers['X-Paytm-Api-Key'],
      hasXPaytmSecret: !!headers['X-Paytm-Secret'],
    });

    const response = await fetch(`${PAYTM_MCP_URL}?action=status`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      log('ERROR', `Status check failed with status ${response.status}`);
      throw new Error(`Status check failed: ${response.status}`);
    }

    const data = await response.json();
    log('INFO', 'MCP status response received', data);
    return data;
  } catch (error) {
    log('ERROR', 'MCP Status error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      connected: false,
      apiKeyConfigured: !!PAYTM_API_KEY,
      secretConfigured: !!PAYTM_SECRET,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function callMCPTool(toolName: string): Promise<any> {
  log('INFO', `Calling MCP tool: ${toolName}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Pass API key and secret via headers to the edge function
  if (PAYTM_API_KEY) {
    headers['X-Paytm-Api-Key'] = PAYTM_API_KEY;
  }
  if (PAYTM_SECRET) {
    headers['X-Paytm-Secret'] = PAYTM_SECRET;
  }

  log('DEBUG', 'MCP tool request prepared', {
    tool: toolName,
    hasXPaytmApiKey: !!headers['X-Paytm-Api-Key'],
    hasXPaytmSecret: !!headers['X-Paytm-Secret'],
  });

  const requestBody = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
    },
  };

  log('DEBUG', 'MCP request body', requestBody);

  const response = await fetch(`${PAYTM_MCP_URL}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('ERROR', `MCP call failed with status ${response.status}`, {
      responseBody: errorText,
    });
    throw new Error(`MCP call failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  log('DEBUG', 'MCP response received', {
    hasError: !!data.error,
    hasResult: !!data.result,
  });

  if (data.error) {
    log('ERROR', 'MCP tool returned error', { error: data.error });
    throw new Error(data.error.message);
  }

  // Parse the text content from MCP response
  const textContent = data.result?.content?.[0]?.text;
  if (textContent) {
    log('DEBUG', 'Parsing MCP text content', {
      contentLength: textContent.length,
      contentPreview: textContent.substring(0, 200),
    });
    try {
      return JSON.parse(textContent);
    } catch (parseError) {
      log('WARN', 'Failed to parse MCP text content as JSON, returning raw', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
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

  log('DEBUG', 'Gemini API request prepared', {
    model: 'gemini-2.0-flash',
    promptLength: prompt.length,
  });

  try {
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('ERROR', `Gemini API error: ${response.status}`, {
        responseBody: errorText,
      });
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const insightText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate insights';
    log('INFO', 'Gemini insights generated successfully', {
      insightLength: insightText.length,
    });
    return insightText;
  } catch (error) {
    log('ERROR', 'Gemini API error', {
      error: error instanceof Error ? error.message : String(error),
    });
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
      const status = await getMCPStatus();
      // Add local config info
      const response = {
        ...status,
        localApiKeyConfigured: !!PAYTM_API_KEY,
        localSecretConfigured: !!PAYTM_SECRET,
        geminiKeyConfigured: !!GEMINI_API_KEY,
      };
      log('INFO', 'Returning status response', { requestId, response });
      return NextResponse.json(response);
    }

    // Get portfolio data from MCP server
    if (action === 'portfolio') {
      if (!PAYTM_API_KEY || !PAYTM_SECRET) {
        log('WARN', 'Paytm credentials not configured', { requestId });
        return NextResponse.json({
          error: 'Paytm Money API credentials not configured. Set PAYTM_MONEY_API_KEY and PAYTM_MONEY_SECRET in environment.',
          status: {
            apiKeyConfigured: !!PAYTM_API_KEY,
            secretConfigured: !!PAYTM_SECRET,
          },
        }, { status: 503 });
      }

      log('INFO', 'Fetching portfolio data', { requestId });

      try {
        // Fetch holdings
        log('DEBUG', 'Calling get_holdings tool', { requestId });
        const holdingsData = await callMCPTool('get_holdings');
        log('INFO', 'Holdings data received', { requestId, dataKeys: Object.keys(holdingsData || {}) });

        // Transform the data
        const holdings: Holding[] = holdingsData?.data?.holdings?.map((h: any) => ({
          trading_symbol: h.trading_symbol || h.symbol,
          exchange: h.exchange || 'NSE',
          quantity: h.quantity || 0,
          average_price: h.average_price || h.avg_price || 0,
          last_price: h.last_price || h.ltp || 0,
          pnl: h.pnl || h.profit_loss || 0,
          pnl_percent: h.pnl_percent || h.change_percent || 0,
          current_value: (h.quantity * h.last_price) || h.current_value || 0,
          investment_value: (h.quantity * h.average_price) || h.investment_value || 0,
        })) || holdingsData?.holdings?.map((h: any) => ({
          trading_symbol: h.trading_symbol || h.symbol,
          exchange: h.exchange || 'NSE',
          quantity: h.quantity || 0,
          average_price: h.average_price || h.avg_price || 0,
          last_price: h.last_price || h.ltp || 0,
          pnl: h.pnl || h.profit_loss || 0,
          pnl_percent: h.pnl_percent || h.change_percent || 0,
          current_value: (h.quantity * h.last_price) || h.current_value || 0,
          investment_value: (h.quantity * h.average_price) || h.investment_value || 0,
        })) || [];

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

        // Generate insights using Gemini
        log('DEBUG', 'Calling Gemini for insights', { requestId });
        const insights = await generateInsights(portfolio);

        const response = {
          ...portfolio,
          insights,
          lastUpdated: new Date().toISOString(),
        };

        log('INFO', 'Portfolio response prepared', { requestId, holdingCount: holdings.length });
        return NextResponse.json(response);
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
      log('DEBUG', 'Fetching holdings value', { requestId });
      const valueData = await callMCPTool('get_holdings_value');
      return NextResponse.json(valueData);
    }

    // Get user details
    if (action === 'user') {
      log('DEBUG', 'Fetching user details', { requestId });
      const userData = await callMCPTool('get_user_details');
      return NextResponse.json(userData);
    }

    log('WARN', 'Invalid action requested', { requestId, action });
    return NextResponse.json({
      error: 'Invalid action. Use: status, portfolio, value, or user',
    }, { status: 400 });

  } catch (error) {
    log('ERROR', 'Unhandled API error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }, { status: 500 });
  }
}
