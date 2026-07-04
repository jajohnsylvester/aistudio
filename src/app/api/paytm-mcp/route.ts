import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Embedded Paytm Money MCP Server
 * Implements the Model Context Protocol (MCP) JSON-RPC 2.0 protocol
 * allowing AI agents (like Google ADK) to interact with Paytm Money API
 */

// Paytm Money API configuration
const PAYTM_API_HOST = 'https://developer.paytmmoney.com';
const PAYTM_LOGIN_URL = 'https://login.paytmmoney.com/merchant-login';

const API_ROUTES: Record<string, string> = {
  access_token: '/accounts/v2/gettoken',
  user_details: '/accounts/v1/user/details',
  holdings: '/holdings/v1/get-user-holdings-data',
  holdings_value: '/holdings/v1/get-holdings-value',
  position: '/orders/v1/position',
  order_book: '/orders/v1/order-book',
};

// MCP Tool definitions
const MCP_TOOLS = [
  {
    name: 'get_holdings',
    description: 'Get the user\'s stock holdings portfolio from Paytm Money account',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_holdings_value',
    description: 'Get the total current market value of user\'s holdings portfolio',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_user_details',
    description: 'Get the user\'s Paytm Money account profile and details',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_positions',
    description: 'Get the user\'s current open intraday positions',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_orders',
    description: 'Get the user\'s order book with all placed orders',
    inputSchema: { type: 'object', properties: {} },
  },
];

// Supabase client for token storage
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

// Decode JWT without verifying signature
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

// Database helpers
async function getAccessTokenFromDB() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('paytm_access_tokens')
      .select('access_token, public_access_token, read_access_token')
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
  } catch { return { accessToken: null, isExpired: true, expiresAt: null }; }
}

async function saveAccessTokenToDB(tokenData: { access_token: string; public_access_token?: string; read_access_token?: string }) {
  const supabase = getSupabaseClient();
  await supabase.from('paytm_access_tokens').update({ is_active: false }).eq('user_id', 'default');
  const { error } = await supabase.from('paytm_access_tokens').insert({
    user_id: 'default',
    access_token: tokenData.access_token,
    public_access_token: tokenData.public_access_token || null,
    read_access_token: tokenData.read_access_token || null,
    is_active: true,
  });
  if (error) throw new Error(`Failed to save token: ${error.message}`);
}

// Paytm API helper
async function callPaytmAPI(endpoint: string, accessToken: string): Promise<any> {
  const proxyUrl = process.env.WEBSHARE_PROXY_URL;
  const options: RequestInit = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  };

  const response = await fetch(`${PAYTM_API_HOST}${endpoint}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 400 || response.status === 401) {
      throw new Error('Access token expired or invalid. Please re-authenticate.');
    }
    if (response.status === 403) throw new Error('Access denied. Check API permissions.');
    if (response.status === 429) throw new Error('Rate limit exceeded. Try again later.');
    throw new Error(`Paytm API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Execute MCP tool calls
async function executeTool(name: string, _args: any): Promise<any> {
  const tokenData = await getAccessTokenFromDB();

  if (!tokenData.accessToken) {
    throw new Error('No access token. Complete OAuth flow first using get_login_url and exchange_token.');
  }
  if (tokenData.isExpired) {
    throw new Error(`Access token expired at ${tokenData.expiresAt?.toISOString()}. Please re-authenticate.`);
  }

  switch (name) {
    case 'get_holdings': return callPaytmAPI(API_ROUTES.holdings, tokenData.accessToken);
    case 'get_holdings_value': return callPaytmAPI(API_ROUTES.holdings_value, tokenData.accessToken);
    case 'get_user_details': return callPaytmAPI(API_ROUTES.user_details, tokenData.accessToken);
    case 'get_positions': return callPaytmAPI(API_ROUTES.position, tokenData.accessToken);
    case 'get_orders': return callPaytmAPI(API_ROUTES.order_book, tokenData.accessToken);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// MCP JSON-RPC handler (POST)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { method, id, params } = body;

    // MCP initialize handshake
    if (method === 'initialize') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'paytm-money-mcp', version: '2.0.0' },
        },
      });
    }

    // List available tools
    if (method === 'tools/list') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: { tools: MCP_TOOLS },
      });
    }

    // Execute a tool
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      if (!toolName) {
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32600, message: 'Missing tool name' },
        }, { status: 400 });
      }

      try {
        const result = await executeTool(toolName, toolArgs);
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
        });
      } catch (e: any) {
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: e.message },
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unknown method: ${method}` },
    }, { status: 400 });

  } catch (e: any) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${e.message}` } },
      { status: 400 }
    );
  }
}

// REST endpoints (GET) - for auth flow and status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const apiKey = process.env.PAYTM_MONEY_API_KEY;
  const apiSecret = process.env.PAYTM_MONEY_SECRET;

  try {
    // Status endpoint
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

    // Login URL for OAuth
    if (action === 'login_url') {
      if (!apiKey) return NextResponse.json({ error: 'PAYTM_MONEY_API_KEY not configured' }, { status: 400 });
      const state = searchParams.get('state') || Date.now().toString();
      return NextResponse.json({
        login_url: `${PAYTM_LOGIN_URL}?apiKey=${apiKey}&state=${state}`,
        state_key: state,
      });
    }

    // Exchange request token for access token
    if (action === 'exchange_token') {
      const requestToken = searchParams.get('request_token');
      if (!requestToken) return NextResponse.json({ error: 'request_token required' }, { status: 400 });
      if (!apiKey || !apiSecret) return NextResponse.json({ error: 'API credentials not configured' }, { status: 500 });

      const response = await fetch(`${PAYTM_API_HOST}${API_ROUTES.access_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, api_secret_key: apiSecret, request_token: requestToken }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return NextResponse.json({ error: `Token exchange failed: ${errText}` }, { status: 500 });
      }

      const tokenData = await response.json();
      if (tokenData.access_token) {
        await saveAccessTokenToDB(tokenData);
        return NextResponse.json({ success: true, hasAccessToken: true, message: 'Access token stored successfully' });
      }

      return NextResponse.json({ error: 'No access token in response' }, { status: 500 });
    }

    // Default: server info
    return NextResponse.json({
      name: 'Paytm Money MCP Server',
      version: '2.0.0',
      protocol: 'MCP JSON-RPC 2.0',
      tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description })),
      endpoints: {
        mcp: 'POST / (MCP JSON-RPC)',
        status: 'GET ?action=status',
        login_url: 'GET ?action=login_url',
        exchange_token: 'GET ?action=exchange_token&request_token=<token>',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
