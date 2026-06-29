import { NextRequest, NextResponse } from 'next/server';

// Google ADK imports - we'll use the agent directly
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PAYTM_MCP_URL = process.env.PAYTM_MCP_URL || 'https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/paytm-mcp';

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
  try {
    const response = await fetch(`${PAYTM_MCP_URL}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('MCP Status error:', error);
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function callMCPTool(toolName: string): Promise<any> {
  const response = await fetch(`${PAYTM_MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP call failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  // Parse the text content from MCP response
  const textContent = data.result?.content?.[0]?.text;
  if (textContent) {
    return JSON.parse(textContent);
  }

  return data.result;
}

// Gemini API call for generating portfolio insights
async function generateInsights(portfolioData: PortfolioSummary): Promise<string> {
  if (!GEMINI_API_KEY) {
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

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
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
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate insights';
  } catch (error) {
    console.error('Gemini API error:', error);
    return 'Unable to generate insights at this time.';
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Check connectivity status
    if (action === 'status') {
      const status = await getMCPStatus();
      return NextResponse.json(status);
    }

    // Get portfolio data from MCP server
    if (action === 'portfolio') {
      const status = await getMCPStatus();

      if (!status.connected) {
        return NextResponse.json({
          error: 'Paytm Money MCP server not connected',
          status,
        }, { status: 503 });
      }

      // Fetch holdings
      const holdingsData = await callMCPTool('get_holdings');

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
      })) || [];

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
      const insights = await generateInsights(portfolio);

      return NextResponse.json({
        ...portfolio,
        insights,
        lastUpdated: new Date().toISOString(),
      });
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

    return NextResponse.json({
      error: 'Invalid action. Use: status, portfolio, value, or user',
    }, { status: 400 });

  } catch (error) {
    console.error('Paytm Portfolio API error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }, { status: 500 });
  }
}
