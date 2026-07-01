import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Enhanced logging for Supabase Edge Functions
function log(level: 'INFO' | 'DEBUG' | 'ERROR' | 'WARN', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data && { data })
  };
  console.log(JSON.stringify(logEntry));
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required?: string[];
  };
}

// Initialize Supabase client for database access
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase URL or Service Role Key not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

// Paytm Money API configuration - from official Python SDK
const PAYTM_API_HOST = "https://developer.paytmmoney.com";
const PAYTM_LOGIN_URL = "https://login.paytmmoney.com/merchant-login";

// API Routes from official SDK
const API_ROUTES: Record<string, string> = {
  access_token: "/accounts/v2/gettoken",
  user_details: "/accounts/v1/user/details",
  holdings: "/holdings/v1/get-user-holdings-data",
  holdings_value: "/holdings/v1/get-holdings-value",
  position: "/orders/v1/position",
  order_book: "/orders/v1/order-book",
  orders: "/orders/v1/user/orders",
  trade_details: "/orders/v1/trade-details",
  funds_summary: "/accounts/v1/funds/summary",
  logout: "/accounts/v1/logout",
};

// Get API credentials from secrets (configured in Supabase dashboard)
function getApiCredentials() {
  const apiKey = Deno.env.get("PAYTM_MONEY_API_KEY");
  const apiSecret = Deno.env.get("PAYTM_MONEY_SECRET");

  log('DEBUG', 'Checking API credentials from secrets', {
    hasApiKey: !!apiKey,
    hasApiSecret: !!apiSecret,
  });

  return { apiKey, apiSecret };
}

// Get access token from database
async function getAccessTokenFromDB(): Promise<{ accessToken: string | null; publicAccessToken: string | null; readAccessToken: string | null }> {
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

    if (error || !data) {
      log('DEBUG', 'No access token found in database', { error: error?.message });
      return { accessToken: null, publicAccessToken: null, readAccessToken: null };
    }

    log('INFO', 'Access token retrieved from database');
    return {
      accessToken: data.access_token,
      publicAccessToken: data.public_access_token,
      readAccessToken: data.read_access_token,
    };
  } catch (e) {
    log('ERROR', 'Failed to get access token from database', { error: String(e) });
    return { accessToken: null, publicAccessToken: null, readAccessToken: null };
  }
}

// Save access token to database
async function saveAccessTokenToDB(tokenData: {
  access_token: string;
  public_access_token?: string;
  read_access_token?: string;
}): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();

    // Deactivate existing tokens
    await supabase
      .from('paytm_access_tokens')
      .update({ is_active: false })
      .eq('user_id', 'default');

    // Insert new token
    const { error } = await supabase
      .from('paytm_access_tokens')
      .insert({
        user_id: 'default',
        access_token: tokenData.access_token,
        public_access_token: tokenData.public_access_token || null,
        read_access_token: tokenData.read_access_token || null,
        is_active: true,
      });

    if (error) {
      log('ERROR', 'Failed to save access token', { error: error.message });
      return false;
    }

    log('INFO', 'Access token saved to database');
    return true;
  } catch (e) {
    log('ERROR', 'Exception saving access token', { error: String(e) });
    return false;
  }
}

// Generate login URL for OAuth flow
function generateLoginUrl(apiKey: string, stateKey: string): string {
  return `${PAYTM_LOGIN_URL}?apiKey=${apiKey}&state=${stateKey}`;
}

// Exchange request_token for access_token
async function exchangeRequestToken(apiKey: string, apiSecret: string, requestToken: string): Promise<any> {
  const url = `${PAYTM_API_HOST}${API_ROUTES.access_token}`;

  log('INFO', 'Exchanging request token for access token', { url });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      api_secret_key: apiSecret,
      request_token: requestToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('ERROR', 'Failed to get access token', { status: response.status, error: errorText });
    throw new Error(`Failed to get access token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  log('INFO', 'Access token received', {
    hasAccessToken: !!data.access_token,
  });

  // Save to database
  if (data.access_token) {
    await saveAccessTokenToDB(data);
  }

  return data;
}

// Call Paytm API with access token
async function callPaytmAPI(endpoint: string, accessToken: string, method: string = "GET", params?: Record<string, string>, body?: any): Promise<any> {
  let url = `${PAYTM_API_HOST}${endpoint}`;

  if (params) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      queryParams.append(key, value);
    }
    url += `?${queryParams.toString()}`;
  }

  log('INFO', 'Calling Paytm API', { endpoint, method, url });

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const options: RequestInit = { method, headers };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  log('INFO', 'Paytm API response', {
    status: response.status,
    statusText: response.statusText,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('ERROR', 'Paytm API error', {
      status: response.status,
      responseBody: errorText,
      endpoint,
    });
    throw new Error(`Paytm API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

// Tool definitions
const tools: MCPTool[] = [
  {
    name: "get_holdings",
    description: "Get the user's stock holdings portfolio from Paytm Money.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_holdings_value",
    description: "Get the total value of the user's holdings portfolio.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_user_details",
    description: "Get the user's Paytm Money account details.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_positions",
    description: "Get the user's current open positions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_orders",
    description: "Get the user's order book.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_login_url",
    description: "Get the OAuth login URL for Paytm Money authentication.",
    inputSchema: {
      type: "object",
      properties: {
        state_key: {
          type: "string",
          description: "A unique state key for OAuth (e.g., timestamp)",
        },
      },
      required: ["state_key"],
    },
  },
  {
    name: "exchange_token",
    description: "Exchange a request_token for access_token and save to database.",
    inputSchema: {
      type: "object",
      properties: {
        request_token: {
          type: "string",
          description: "The request_token from OAuth redirect",
        },
      },
      required: ["request_token"],
    },
  },
];

// Tool handlers
async function handleTool(name: string, apiKey: string, apiSecret: string, params?: any): Promise<any> {
  log('INFO', `Handling tool: ${name}`);

  // Tools that don't require access token
  if (name === "get_login_url") {
    const stateKey = params?.state_key || Date.now().toString();
    return {
      login_url: generateLoginUrl(apiKey, stateKey),
      instructions: "Visit the login URL, authenticate, and use the request_token from redirect URL",
    };
  }

  if (name === "exchange_token") {
    const requestToken = params?.request_token;
    if (!requestToken) {
      throw new Error("request_token is required");
    }
    return await exchangeRequestToken(apiKey, apiSecret, requestToken);
  }

  // Get access token from database
  const tokenData = await getAccessTokenFromDB();

  if (!tokenData.accessToken) {
    throw new Error("No access token found. Complete OAuth flow first using 'get_login_url' and 'exchange_token' tools.");
  }

  switch (name) {
    case "get_holdings":
      return await callPaytmAPI(API_ROUTES.holdings, tokenData.accessToken);
    case "get_holdings_value":
      return await callPaytmAPI(API_ROUTES.holdings_value, tokenData.accessToken);
    case "get_user_details":
      return await callPaytmAPI(API_ROUTES.user_details, tokenData.accessToken);
    case "get_positions":
      return await callPaytmAPI(API_ROUTES.position, tokenData.accessToken);
    case "get_orders":
      return await callPaytmAPI(API_ROUTES.order_book, tokenData.accessToken);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

Deno.serve(async (req: Request) => {
  const requestTime = new Date().toISOString();
  log('INFO', `Incoming request`, { time: requestTime, method: req.method, url: req.url });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  try {
    const { apiKey, apiSecret } = getApiCredentials();

    // Status endpoint
    const action = url.searchParams.get('action');
    if (action === 'status' || action === 'health') {
      const tokenData = await getAccessTokenFromDB();
      const status = {
        connected: !!(apiKey && apiSecret),
        hasAccessToken: !!tokenData.accessToken,
        apiKeyConfigured: !!apiKey,
        secretConfigured: !!apiSecret,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Login URL endpoint
    if (action === 'login_url') {
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "API Key not configured in secrets" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const state = url.searchParams.get('state') || Date.now().toString();
      const loginUrl = generateLoginUrl(apiKey, state);

      return new Response(JSON.stringify({
        login_url: loginUrl,
        state_key: state,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange token endpoint
    if (action === 'exchange_token') {
      const requestToken = url.searchParams.get('request_token');
      if (!requestToken) {
        return new Response(JSON.stringify({ error: "request_token parameter required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!apiKey || !apiSecret) {
        return new Response(JSON.stringify({ error: "API credentials not configured in secrets" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const tokenData = await exchangeRequestToken(apiKey, apiSecret, requestToken);
        return new Response(JSON.stringify({
          success: true,
          message: "Access token saved to database",
          hasAccessToken: !!tokenData.access_token,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // MCP protocol endpoint
    if (req.method === "POST") {
      log('INFO', 'Handling MCP POST request');
      const body = await req.json();

      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: {
              name: "paytm-money-mcp",
              version: "2.0.0",
            },
          },
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (body.method === "tools/call") {
        const toolName = body.params?.name;
        const toolParams = body.params?.arguments || {};

        if (!toolName) {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32600, message: "Missing tool name" },
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        try {
          if (!apiKey || !apiSecret) {
            throw new Error("Paytm Money API credentials not configured in Supabase secrets");
          }

          const result = await handleTool(toolName, apiKey, apiSecret, toolParams);

          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            },
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (e: any) {
          log('ERROR', `Tool ${toolName} failed`, { error: e.message });
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32603, message: e.message },
          }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32601, message: `Unknown method: ${body.method}` },
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default response
    return new Response(JSON.stringify({
      status: "ok",
      message: "Paytm Money MCP Server v2.0 - Secrets stored in Supabase",
      endpoints: {
        status: "GET ?action=status",
        login_url: "GET ?action=login_url&state=<random>",
        exchange_token: "GET ?action=exchange_token&request_token=<token>",
        mcp: "POST / (MCP protocol)",
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    log('ERROR', 'Unhandled error', { error: e.message, stack: e.stack });
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
