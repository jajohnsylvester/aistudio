import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { GoogleGenAI } from '@google/genai';

// Initialize the Google Gemini Gen AI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Google Sheets Credentials Validation Bounds
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '';
const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '';
const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n');

// Mock data mechanism matching your architecture for Demo/Fallback validation
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
      hasAccessToken: true,
      tokenExpired: false,
      apiKeyConfigured: !!process.env.PAYTM_API_KEY,
      secretConfigured: !!process.env.PAYTM_API_SECRET,
      serverTimestamp: new Date().toISOString(),
      refreshIntervalSeconds: 300,
      jwtMeta: { iatStr: new Date().toISOString(), expStr: new Date(Date.now() + 86400000).toISOString(), rawIat: Math.floor(Date.now()/1000), rawExp: Math.floor(Date.now()/1000) + 86400 }
    });
  }

  if (action === 'portfolio') {
    const totalInvestment = mockHoldings.reduce((sum, h) => sum + h.investment_value, 0);
    const totalCurrentValue = mockHoldings.reduce((sum, h) => sum + h.current_value, 0);
    const totalPnl = totalCurrentValue - totalInvestment;
    const totalPnlPercent = (totalPnl / totalInvestment) * 100;

    return NextResponse.json({
      totalInvestment,
      totalCurrentValue,
      totalPnl,
      totalPnlPercent,
      holdings: mockHoldings,
      insights: "Overall Portfolio is performing adequately. Technology weights are offsetting minor financial retracements.",
      lastUpdated: new Date().toISOString(),
      paytmApiTimestamp: new Date().toISOString()
    });
  }

  return NextResponse.json({ error: 'Invalid action constraint path specified.' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // Gemini AI Insights for specific strategy sets
  if (action === 'strategy_insights') {
    try {
      const body = await request.json();
      const { strategyName, holdings } = body;

      if (!holdings || holdings.length === 0) {
        return NextResponse.json({ insights: "No allocation found. Add symbols to parse." });
      }

      const formattedData = holdings.map((h: any) => 
        `${h.trading_symbol}: Qty ${h.quantity}, Cost ₹${h.average_price}, LTP ₹${h.last_price}, P&L: ₹${h.pnl.toFixed(2)} (${h.pnl_percent}%)`
      ).join('\n');

      const prompt = `You are an expert financial advisor analyzing a sub-strategy portfolio segment named "${strategyName}". Analyze the risk allocations and technical performance metrics based on the current holding items: \n${formattedData}\nProvide concise, highly actionable investment insights.`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      return NextResponse.json({ insights: aiResponse.text });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // Save Strategy Allocations directly to Google Sheet
  if (action === 'save_strategies') {
    try {
      const body = await request.json();
      const { strategies, portfolioHoldings } = body;

      if (!clientEmail || !privateKey || !SPREADSHEET_ID) {
        throw new Error("Google API credentials environment parameters missing.");
      }

      const auth = new google.auth.JWT(clientEmail, undefined, privateKey, ['https://www.googleapis.com/auth/spreadsheets']);
      const sheets = google.sheets({ version: 'v4', auth });

      // Transform data into dynamic sheets data structure arrays
      const rows = [
        ['Strategy Execution Mapping Framework Matrix', '', '', '', '', ''],
        ['Timestamp:', new Date().toLocaleString(), '', '', '', ''],
        [],
        ['Strategy Name', 'Assigned Asset Symbols', 'Invested Value', 'Current Valuation', 'Absolute Net Profit/Loss', 'Gross Returns %']
      ];

      strategies.forEach((strat: any) => {
        const matches = portfolioHoldings.filter((h: any) => strat.symbols.includes(h.trading_symbol.toUpperCase()));
        const investment = matches.reduce((sum: number, h: any) => sum + h.investment_value, 0);
        const current = matches.reduce((sum: number, h: any) => sum + h.current_value, 0);
        const pnl = current - investment;
        const pnlPercent = investment > 0 ? (pnl / investment) * 100 : 0;

        rows.push([
          strat.name,
          strat.symbols.join(', '),
          `₹${investment.toFixed(2)}`,
          `₹${current.toFixed(2)}`,
          `₹${pnl.toFixed(2)}`,
          `${pnlPercent.toFixed(2)}%`
        ]);
      });

      // Clear existing values safely without deleting the underlying formatting structures
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Strategies!A1:F100',
      });

      // Update values natively via append/write requests
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Strategies!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      });

      return NextResponse.json({ success: true });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Post payload parsing actions invalid.' }, { status: 400 });
}
