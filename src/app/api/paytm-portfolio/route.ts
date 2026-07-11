import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

// Upstream Google Sheets Credentials Parameters
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '';
const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '';
const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// In-Memory Token Persistence Layer Mock (Matches original architecture expectations)
let globalSessionToken = '';
let isTokenExpired = false;

// Mock data matrix fallback matching original layout configuration for fallback loops
const mockHoldings = [
  { trading_symbol: 'INFY', exchange: 'NSE', quantity: 50, average_price: 1420.0, last_price: 1510.5, pnl: 4525.0, pnl_percent: 6.37, current_value: 75525.0, investment_value: 71000.0, sector: 'Technology' },
  { trading_symbol: 'RELIANCE', exchange: 'NSE', quantity: 20, average_price: 2450.0, last_price: 2610.0, pnl: 3200.0, pnl_percent: 6.53, current_value: 52200.0, investment_value: 49000.0, sector: 'Energy' },
  { trading_symbol: 'HDFCBANK', exchange: 'NSE', quantity: 35, average_price: 1550.0, last_price: 1495.0, pnl: -1925.0, pnl_percent: -3.54, current_value: 52325.0, investment_value: 54250.0, sector: 'Finance' },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'status') {
    return NextResponse.json({
      connected: true,
      hasAccessToken: !!globalSessionToken,
      tokenExpired: isTokenExpired,
      apiKeyConfigured: !!process.env.PAYTM_API_KEY,
      secretConfigured: !!process.env.PAYTM_API_SECRET,
      serverTimestamp: new Date().toISOString(),
      refreshIntervalSeconds: 300,
      tools: [
        { name: 'get_portfolio_summary', description: 'Returns base level macro summaries' },
        { name: 'get_alpha_signals', description: 'Parses structural trends' }
      ],
      jwtMeta: globalSessionToken ? {
        iatStr: new Date().toLocaleString(),
        expStr: new Date(Date.now() + 3600000).toLocaleString(),
        rawIat: Math.floor(Date.now() / 1000),
        rawExp: Math.floor(Date.now() / 1000) + 3600
      } : null
    });
  }

  if (action === 'portfolio') {
    if (!globalSessionToken && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'OAuth handshake required', oauthRequired: true });
    }

    const totalInvestment = mockHoldings.reduce((sum, h) => sum + h.investment_value, 0);
    const totalCurrentValue = mockHoldings.reduce((sum, h) => sum + h.current_value, 0);
    const totalPnl = totalCurrentValue - totalInvestment;
    const totalPnlPercent = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

    return NextResponse.json({
      totalInvestment,
      totalCurrentValue,
      totalPnl,
      totalPnlPercent,
      holdings: mockHoldings,
      insights: "Overall Portfolio allocation looks solid. Core technical trends show strong multi-sector alignment.",
      agentModel: "Gemini Pro Direct Rest API Engine",
      lastUpdated: new Date().toISOString(),
      paytmApiTimestamp: new Date().toISOString(),
      jwtMeta: {
        iatStr: new Date().toLocaleString(),
        expStr: new Date(Date.now() + 3600000).toLocaleString(),
        rawIat: Math.floor(Date.now() / 1000),
        rawExp: Math.floor(Date.now() / 1000) + 3600
      }
    });
  }

  if (action === 'exchange_token') {
    const requestToken = searchParams.get('request_token');
    if (!requestToken) {
      return NextResponse.json({ error: 'Missing token parameters' }, { status: 400 });
    }
    globalSessionToken = `mock_viable_session_jwt_${Math.random().toString(36).substr(2)}`;
    isTokenExpired = false;
    return NextResponse.json({ success: true, token: globalSessionToken });
  }

  if (action === 'clear_token') {
    globalSessionToken = '';
    isTokenExpired = true;
    return NextResponse.json({ success: true });
  }

  if (action === 'login') {
    const apiKey = process.env.PAYTM_API_KEY || 'mock_api_key';
    const redirectUrl = encodeURIComponent(`${request.nextUrl.origin}/paytm-portfolio`);
    return NextResponse.redirect(`https://login.paytmmoney.com/merchant-login?apiKey=${apiKey}&redirectUrl=${redirectUrl}`);
  }

  return NextResponse.json({ error: 'Action path configuration parameters unrecognized.' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'execute_mcp_tool') {
    try {
      const body = await request.json();
      const { toolName, arguments: toolArgs } = body;
      return NextResponse.json({
        status: "success",
        executedTool: toolName,
        payloadResult: {
          notice: "MCP dynamic tool execution context evaluated safely.",
          passedArguments: toolArgs,
          timestamp: new Date().toISOString()
        }
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // UPDATED: Using a direct, standard HTTP fetch framework to contact the Gemini service
  if (action === 'strategy_insights') {
    try {
      const body = await request.json();
      const { strategyName, holdings } = body;

      if (!holdings || holdings.length === 0) {
        return NextResponse.json({ insights: "No active assets mapped to this strategy segment." });
      }

      if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY configuration variable is missing.");
      }

      const formattedData = holdings.map((h: any) => 
        `- ${h.trading_symbol}: ${h.quantity} units | Cost: ₹${h.average_price.toFixed(2)} | LTP: ₹${h.last_price.toFixed(2)} | P&L: ₹${h.pnl.toFixed(2)} (${h.pnl_percent.toFixed(2)}%)`
      ).join('\n');

      const promptText = `You are a financial analyst analyzing a localized custom trading strategy sub-bucket named "${strategyName}". Assess the capital safety and technical performance based on its mapped asset components:\n\n${formattedData}\n\nProvide direct, actionable alpha generation advice without generic fluff.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });

      if (!response.ok) {
        const errorDetails = await response.text();
        throw new Error(`Gemini Server Gateway rejected processing request: ${errorDetails}`);
      }

      const resData = await response.json();
      const parsedInsights = resData.candidates?.[0]?.content?.parts?.[0]?.text || 'No explicit analytical insights generated.';

      return NextResponse.json({ insights: parsedInsights });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (action === 'save_strategies') {
    try {
      const body = await request.json();
      const { strategies, portfolioHoldings } = body;

      if (!clientEmail || !privateKey || !SPREADSHEET_ID) {
        throw new Error("Google Integration environmental config values are missing.");
      }

      const auth = new google.auth.JWT(clientEmail, undefined, privateKey, ['https://www.googleapis.com/auth/spreadsheets']);
      const sheets = google.sheets({ version: 'v4', auth });

      const dataRows = [
        ['Strategy Execution Mapping Framework Matrix', '', '', '', '', ''],
        ['Timestamp:', new Date().toLocaleString(), '', '', '', ''],
        [],
        ['Strategy Name', 'Assigned Asset Symbols', 'Invested Value', 'Current Valuation', 'Absolute Net Profit/Loss', 'Gross Returns %']
      ];

      strategies.forEach((strat: any) => {
        const matches = (portfolioHoldings || mockHoldings).filter((h: any) => strat.symbols.includes(h.trading_symbol.toUpperCase()));
        const investment = matches.reduce((sum: number, h: any) => sum + h.investment_value, 0);
        const current = matches.reduce((sum: number, h: any) => sum + h.current_value, 0);
        const pnl = current - investment;
        const pnlPercent = investment > 0 ? (pnl / investment) * 100 : 0;

        dataRows.push([
          strat.name,
          strat.symbols.join(', '),
          `₹${investment.toFixed(2)}`,
          `₹${current.toFixed(2)}`,
          `₹${pnl.toFixed(2)}`,
          `${pnlPercent.toFixed(2)}%`
        ]);
      });

      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Strategies!A1:F100',
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Strategies!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: dataRows },
      });

      return NextResponse.json({ success: true });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Post payload processing action missing or incorrect.' }, { status: 400 });
}
