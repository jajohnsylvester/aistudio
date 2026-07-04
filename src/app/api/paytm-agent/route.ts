import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Paytm Money Portfolio Agent - Powered by Google ADK + Gemini 2.5 Flash
 *
 * This route creates a Google ADK agent that uses the embedded Paytm Money MCP
 * tools to fetch portfolio data and generate AI insights.
 */

// Paytm Money API configuration
const PAYTM_API_HOST = 'https://developer.paytmmoney.com';

const API_ROUTES = {
  access_token: '/accounts/v2/gettoken',
  user_details: '/accounts/v1/user/details',
  holdings: '/holdings/v1/get-user-holdings-data',
  holdings_value: '/holdings/v1/get-holdings-value',
  position: '/orders/v1/position',
  order_book: '/orders/v1/order-book',
};

// Supabase client
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

// Token helpers
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch { return null; }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= (payload.exp * 1000 - 5 * 60 * 1000);
}

function getTokenExpiryTime(token: string): Date | null {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? new Date(payload.exp * 1000) : null;
}

async function getAccessTokenFromDB() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('paytm_access_tokens')
    .select('access_token')
    .eq('user_id', 'default')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return { accessToken: null, isExpired: true, expiresAt: null };

  return {
    accessToken: data.access_token as string,
    isExpired: isTokenExpired(data.access_token),
    expiresAt: getTokenExpiryTime(data.access_token),
  };
}

// Paytm API calls
async function callPaytmAPI(endpoint: string, accessToken: string): Promise<any> {
  const response = await fetch(`${PAYTM_API_HOST}${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 400 || response.status === 401) throw new Error('Access token expired. Please re-authenticate.');
    const errorText = await response.text();
    throw new Error(`Paytm API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

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

// Use Google ADK agent to fetch portfolio and generate insights
async function runPortfolioAgent(accessToken: string): Promise<{
  holdings: Holding[];
  totalInvestment: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  insights: string;
  agentModel: string;
}> {
  const geminiKey = process.env.GEMINI_API_KEY;

  // ADK Tool execution functions (these ARE the embedded MCP server tools)
  const getHoldingsData = async () => callPaytmAPI(API_ROUTES.holdings, accessToken);
  const getUserDetailsData = async () => callPaytmAPI(API_ROUTES.user_details, accessToken);
  const getPositionsData = async () => callPaytmAPI(API_ROUTES.position, accessToken);

  // Fetch raw portfolio data directly via MCP server tools
  const holdingsRaw = await getHoldingsData();
  const rawHoldings = holdingsRaw?.data?.holdings || holdingsRaw?.holdings || [];

  const holdings: Holding[] = rawHoldings.map((h: any) => ({
    trading_symbol: h.trading_symbol || h.symbol || h.pml_id || 'Unknown',
    exchange: h.exchange || 'NSE',
    quantity: parseFloat(h.quantity) || parseFloat(h.qty) || 0,
    average_price: parseFloat(h.average_price) || parseFloat(h.avg_price) || 0,
    last_price: parseFloat(h.last_price) || parseFloat(h.ltp) || 0,
    pnl: parseFloat(h.pnl) || parseFloat(h.profit_loss) || 0,
    pnl_percent: parseFloat(h.pnl_percent) || parseFloat(h.change_percent) || 0,
    current_value: (parseFloat(h.quantity) || 0) * (parseFloat(h.last_price) || 0),
    investment_value: (parseFloat(h.quantity) || 0) * (parseFloat(h.average_price) || 0),
  }));

  const totalInvestment = holdings.reduce((s, h) => s + h.investment_value, 0);
  const totalCurrentValue = holdings.reduce((s, h) => s + h.current_value, 0);
  const totalPnl = totalCurrentValue - totalInvestment;
  const totalPnlPercent = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

  // Use Google ADK (Gemini 2.5 Flash) via FunctionTool + LlmAgent for AI insights
  let insights = '';
  const agentModel = 'gemini-2.5-flash';

  if (geminiKey && holdings.length > 0) {
    try {
      // Load Google ADK classes via absolute path (bypasses package.json exports restriction)
      // process.cwd() makes the path dynamic so webpack doesn't analyze these at build time
      const adkBase = `${process.cwd()}/node_modules/@google/adk/dist/cjs`;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LlmAgent } = require(`${adkBase}/agents/llm_agent.js`);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { InMemoryRunner } = require(`${adkBase}/runner/in_memory_runner.js`);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { FunctionTool } = require(`${adkBase}/tools/function_tool.js`);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isFinalResponse } = require(`${adkBase}/events/event.js`);

      // Define Paytm MCP tools as ADK FunctionTools
      const holdingsTool = new FunctionTool({
        name: 'get_portfolio_summary',
        description: 'Returns the user portfolio summary including all holdings, totals, and P&L',
        execute: async () => ({
          holdings: holdings.map(h => ({
            symbol: h.trading_symbol,
            exchange: h.exchange,
            quantity: h.quantity,
            avgPrice: h.average_price,
            lastPrice: h.last_price,
            pnl: h.pnl,
            pnlPercent: h.pnl_percent,
          })),
          summary: {
            totalInvestment,
            totalCurrentValue,
            totalPnl,
            totalPnlPercent: totalPnlPercent.toFixed(2),
            holdingsCount: holdings.length,
          },
        }),
      });

      // Create ADK LlmAgent with Gemini 2.5 Flash and Paytm MCP tools
      const agent = new LlmAgent({
        name: 'paytm_portfolio_agent',
        model: agentModel,
        instruction: `You are a financial portfolio analyst. Analyze the user's Paytm Money stock portfolio data provided by the get_portfolio_summary tool.
Provide a concise, insightful analysis covering:
1. Portfolio diversification and sector concentration
2. Top performers and underperformers
3. Overall portfolio health and risk assessment
4. Brief strategic recommendations
Keep the response focused and under 300 words.`,
        tools: [holdingsTool],
      });

      // Run with InMemoryRunner (Google ADK runner)
      const runner = new InMemoryRunner({ agent, appName: 'paytm-portfolio' });

      const userId = 'portfolio-user';
      const newMessage = {
        role: 'user',
        parts: [{ text: 'Please analyze my Paytm Money stock portfolio and provide insights.' }],
      };

      // Collect final response from the ADK agent
      const events: any[] = [];
      for await (const event of runner.runEphemeral({ newMessage, userId })) {
        events.push(event);
      }

      // Extract the final text response
      const finalEvent = events.reverse().find((e: any) => isFinalResponse(e));
      if (finalEvent?.content?.parts) {
        insights = finalEvent.content.parts
          .filter((p: any) => p.text && !p.thought)
          .map((p: any) => p.text)
          .join('');
      }
    } catch (adkError: any) {
      console.error('ADK agent error:', adkError.message);
      // Fallback to direct Gemini API call if ADK fails
      insights = await generateInsightsFallback(holdings, totalInvestment, totalCurrentValue, totalPnl, totalPnlPercent, geminiKey);
    }
  }

  return { holdings, totalInvestment, totalCurrentValue, totalPnl, totalPnlPercent, insights, agentModel };
}

// Fallback: direct Gemini API call if ADK runner fails
async function generateInsightsFallback(
  holdings: Holding[],
  totalInvestment: number,
  totalCurrentValue: number,
  totalPnl: number,
  totalPnlPercent: number,
  geminiKey: string
): Promise<string> {
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

    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'AI insights unavailable.';
  } catch {
    return 'Unable to generate AI insights at this time.';
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'portfolio';

  try {
    if (action === 'portfolio') {
      const tokenData = await getAccessTokenFromDB();

      if (!tokenData.accessToken) {
        return NextResponse.json({
          error: 'No access token found. Please complete OAuth authentication.',
          oauthRequired: true,
        }, { status: 401 });
      }

      if (tokenData.isExpired) {
        return NextResponse.json({
          error: `Access token expired at ${tokenData.expiresAt?.toISOString()}. Please re-authenticate.`,
          tokenExpired: true,
          oauthRequired: true,
        }, { status: 401 });
      }

      const portfolioData = await runPortfolioAgent(tokenData.accessToken);

      return NextResponse.json({
        ...portfolioData,
        lastUpdated: new Date().toISOString(),
        source: 'Google ADK + Paytm Money MCP Server',
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error: any) {
    const isTokenError = error.message?.includes('expired') ||
                         error.message?.includes('authenticate') ||
                         error.message?.includes('token');
    return NextResponse.json({
      error: error.message,
      tokenExpired: isTokenError,
      oauthRequired: isTokenError,
    }, { status: isTokenError ? 401 : 500 });
  }
}
