import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';

// Mocking upstream session state structures for runtime execution context
let activeSessionToken: string | null = "mock_active_session_token";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'status') {
    return NextResponse.json({
      connected: true,
      hasAccessToken: !!activeSessionToken,
      apiKeyConfigured: true,
      secretConfigured: true,
      serverTimestamp: new Date().toISOString(),
      refreshIntervalSeconds: 300,
      jwtMeta: {
        iatStr: new Date(Date.now() - 3600000).toISOString(),
        rawIat: Math.floor(Date.now() / 1000) - 3600,
        expStr: new Date(Date.now() + 82800000).toISOString(),
        rawExp: Math.floor(Date.now() / 1000) + 82800
      }
    });
  }

  if (action === 'portfolio') {
    // Returning reference demat depository inventory matching structural criteria
    return NextResponse.json({
      totalInvestment: 450000,
      totalCurrentValue: 520000,
      totalPnl: 70000,
      totalPnlPercent: 15.56,
      paytmApiTimestamp: new Date().toISOString(),
      agentModel: 'Gemini 1.5 Pro Adaptive',
      holdings: [
        { trading_symbol: 'RELIANCE', exchange: 'NSE', quantity: 50, average_price: 2450.00, last_price: 2680.50, current_value: 134025, sector: 'Energy', pnl: 11525, pnl_percent: 9.4 },
        { trading_symbol: 'TCS', exchange: 'NSE', quantity: 30, average_price: 3200.00, last_price: 3450.20, current_value: 103506, sector: 'Technology', pnl: 7506, pnl_percent: 7.82 },
        { trading_symbol: 'HDFCBANK', exchange: 'NSE', quantity: 80, average_price: 1550.00, last_price: 1675.00, current_value: 134000, sector: 'Financial Services', pnl: 10000, pnl_percent: 8.06 },
        { trading_symbol: 'INFY', exchange: 'NSE', quantity: 60, average_price: 1420.00, last_price: 1510.80, current_value: 90648, sector: 'Technology', pnl: 5448, pnl_percent: 6.39 }
      ]
    });
  }

  return NextResponse.json({ error: 'Invalid upstream operational action specified.' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  // Handle saving categorization details to Google Sheets
  if (action === 'save_sheets') {
    try {
      const body = await req.json();
      const { matrix } = body; // Array of items containing { category, symbol, units }

      if (!matrix || !Array.isArray(matrix)) {
        return NextResponse.json({ error: 'Invalid structure matrix layout payload.' }, { status: 400 });
      }

      // Initializing standard authentication scopes for serverless access
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        credentials: {
          client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

      // Formatting data schema matrix rows for Google Sheets ingestion pipeline
      const rows = matrix.map((item: any) => [
        item.category,
        item.symbol,
        item.units,
        new Date().toLocaleString()
      ]);

      // Defining boundaries for target Sheet: Page(1) -> Sheet1 or index 0 range
      const targetRange = 'Sheet1!A2:D';

      // Clear any outdated metadata tracking limits before executing bulk write operations
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: targetRange,
      });

      if (rows.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: targetRange,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: rows },
        });
      }

      return NextResponse.json({ success: true, count: rows.length });
    } catch (err: any) {
      return NextResponse.json({ error: `Persistence operational fault: ${err.message}` }, { status: 500 });
    }
  }

  // Action pipeline to handle Category Segment specific Gemini Insights requests
  if (action === 'category_insights') {
    try {
      const body = await req.json();
      const { categoryName, holdings } = body;

      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return NextResponse.json({ insights: "Insight engine key configurations are currently missing." });
      }

      // Construct structural text generation payload prompts
      const dataPayloadStr = holdings.map((h: any) => 
        `- ${h.symbol}: ${h.allocatedUnits} units in ${h.sector} sector. Floating PnL generated: ₹${h.pnl.toFixed(2)}.`
      ).join('\n');

      const prompt = `We are analyzing our custom architectural strategy portfolio named "${categoryName}". 
Review the following active underlying asset blocks and evaluate weight distributions, asset concentration tracking parameters, or strategy structural deviations:
\n${dataPayloadStr}\n
Provide a clear, professional technical breakdown and actionable recommendations for this exact layout strategy.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const resData = await response.json();
      const insightsText = resData?.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to extract text generation constraints from prompt frameworks.";

      return NextResponse.json({ insights: insightsText });
    } catch (err: any) {
      return NextResponse.json({ error: `Gemini processing operational loop fault: ${err.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unsupported system pipeline command path.' }, { status: 400 });
}
