import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Paytm-Api-Key, X-Paytm-Secret, X-Paytm-Access-Token",
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

// Paytm Money API configuration - from official Python SDK
// Host for API calls
const PAYTM_API_HOST = "https://developer.paytmmoney.com";
// Login URL for OAuth flow
const PAYTM_LOGIN_URL = "https://login.paytmmoney.com/merchant-login";

// API Routes from official SDK constants.py
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

// Get credentials from headers or environment
function getCredentials(req: Request): {
  apiKey: string | null;
  apiSecret: string | null;
  accessToken: string | null;
} {
  // Try headers first (from Next.js API route)
  const headerApiKey = req.headers.get("X-Paytm-Api-Key");
  const headerApiSecret = req.headers.get("X-Paytm-Secret");
  const headerAccessToken = req.headers.get("X-Paytm-Access-Token");

  // Fall back to environment variables
  const envApiKey = Deno.env.get("PAYTM_MONEY_API_KEY");
  const envApiSecret = Deno.env.get("PAYTM_MONEY_SECRET");
  const envAccessToken = Deno.env.get("PAYTM_ACCESS_TOKEN");

  log('DEBUG', 'Credentials check', {
    hasHeaderApiKey: !!headerApiKey,
    hasHeaderApiSecret: !!headerApiSecret,
    hasHeaderAccessToken: !!headerAccessToken,
    hasEnvApiKey: !!envApiKey,
    hasEnvApiSecret: !!envApiSecret,
    hasEnvAccessToken: !!envAccessToken,
  });

  return {
    apiKey: headerApiKey || envApiKey || null,
    apiSecret: headerApiSecret || envApiSecret || null,
    accessToken: headerAccessToken || envAccessToken || null,
  };
}

// Generate login URL for OAuth flow
function generateLoginUrl(apiKey: string, stateKey: string): string {
  return `${PAYTM_LOGIN_URL}?apiKey=${apiKey}&state=${stateKey}`;
}

// Exchange request_token for access_token
async function getAccessToken(apiKey: string, apiSecret: string, requestToken: string): Promise<any> {
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
    hasPublicAccessToken: !!data.public_access_token,
    hasReadAccessToken: !!data.read_access_token,
  });

  return data;
}

// Call Paytm API with access token
async function callPaytmAPI(endpoint: string, accessToken: string, method: string = "GET", params?: Record<string, string>, body?: any): Promise<any> {
  let url = `${PAYTM_API_HOST}${endpoint}`;

  // Add query params if provided
  if (params) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      queryParams.append(key, value);
    }
    url += `?${queryParams.toString()}`;
  }

  log('INFO', 'Calling Paytm API', {
    endpoint,
    method,
    url,
  });

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const startTime = Date.now();
  const response = await fetch(url, options);
  const elapsed = Date.now() - startTime;

  log('INFO', 'Paytm API response', {
    status: response.status,
    statusText: response.statusText,
    elapsedMs: elapsed,
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
    description: "Get the user's stock holdings portfolio from Paytm Money. Requires access_token.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_holdings_value",
    description: "Get the total value of the user's holdings portfolio from Paytm Money.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_user_details",
    description: "Get the user's Paytm Money account details including profile information.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_positions",
    description: "Get the user's current open positions (intraday and F&O positions).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_orders",
    description: "Get the user's order book showing all pending and executed orders.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_trade_book",
    description: "Get the user's trade book showing all executed trades.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_login_url",
    description: "Get the OAuth login URL for the user to authenticate. Returns URL to visit in browser.",
    inputSchema: {
      type: "object",
      properties: {
        state_key: {
          type: "string",
          description: "A unique state key for the OAuth flow (e.g., a random string or timestamp)",
        },
      },
      required: ["state_key"],
    },
  },
  {
    name: "exchange_token",
    description: "Exchange a request_token (obtained after OAuth login) for an access_token.",
    inputSchema: {
      type: "object",
      properties: {
        request_token: {
          type: "string",
          description: "The request_token received after successful OAuth login",
        },
      },
      required: ["request_token"],
    },
  },
];

// Tool handlers
async function handleTool(name: string, credentials: { apiKey: string; apiSecret: string; accessToken: string | null }, params?: any): Promise<any> {
  log('INFO', `Handling tool: ${name}`, { hasAccessToken: !!credentials.accessToken });

  // Tools that don't require access token
  if (name === "get_login_url") {
    const stateKey = params?.state_key || Date.now().toString();
    return {
      login_url: generateLoginUrl(credentials.apiKey, stateKey),
      instructions: "1. Visit the login URL in your browser\n2. Login with your Paytm Money credentials (username, password, OTP, passcode)\n3. After successful login, you will be redirected to your configured redirect URL with a 'request_token' parameter\n4. Use the 'exchange_token' tool with the request_token to get your access_token",
      state_key: stateKey,
    };
  }

  if (name === "exchange_token") {
    const requestToken = params?.request_token;
    if (!requestToken) {
      throw new Error("request_token is required");
    }
    return await getAccessToken(credentials.apiKey, credentials.apiSecret, requestToken);
  }

  // All other tools require access token
  if (!credentials.accessToken) {
    throw new Error("Access token required. Use 'get_login_url' to get OAuth login URL, then 'exchange_token' to get access token. Set PAYTM_ACCESS_TOKEN environment variable or pass via X-Paytm-Access-Token header.");
  }

  switch (name) {
    case "get_holdings":
      return await callPaytmAPI(API_ROUTES.holdings, credentials.accessToken);

    case "get_holdings_value":
      return await callPaytmAPI(API_ROUTES.holdings_value, credentials.accessToken);

    case "get_user_details":
      return await callPaytmAPI(API_ROUTES.user_details, credentials.accessToken);

    case "get_positions":
      return await callPaytmAPI(API_ROUTES.position, credentials.accessToken);

    case "get_orders":
      return await callPaytmAPI(API_ROUTES.order_book, credentials.accessToken);

    case "get_trade_book":
      return await callPaytmAPI(API_ROUTES.orders, credentials.accessToken);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

Deno.serve(async (req: Request) => {
  const requestTime = new Date().toISOString();
  log('INFO', `Incoming request`, {
    time: requestTime,
    method: req.method,
    url: req.url,
  });

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  try {
    const credentials = getCredentials(req);

    // Check connectivity status
    const action = url.searchParams.get('action');
    const isStatusRequest = action === 'status' || action === 'health';

    if (isStatusRequest) {
      log('INFO', 'Handling status request');
      const status = {
        connected: !!(credentials.apiKey && credentials.apiSecret),
        hasAccessToken: !!credentials.accessToken,
        apiKeyConfigured: !!credentials.apiKey,
        secretConfigured: !!credentials.apiSecret,
        timestamp: new Date().toISOString(),
        authRequired: "OAuth login required to get access_token",
        oauthFlow: {
          step1: "Use 'get_login_url' tool to get login URL",
          step2: "Visit login URL and authenticate",
          step3: "Get request_token from redirect URL",
          step4: "Use 'exchange_token' tool to get access_token",
        },
      };

      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get login URL endpoint
    if (action === 'login_url') {
      if (!credentials.apiKey) {
        return new Response(JSON.stringify({ error: "API Key not configured" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const stateKey = url.searchParams.get('state') || Date.now().toString();
      const loginUrl = generateLoginUrl(credentials.apiKey, stateKey);

      return new Response(JSON.stringify({
        login_url: loginUrl,
        state_key: stateKey,
        instructions: "Visit this URL to login. After successful login, you'll be redirected with a request_token.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange request token for access token
    if (action === 'exchange_token') {
      const requestToken = url.searchParams.get('request_token');
      if (!requestToken) {
        return new Response(JSON.stringify({ error: "request_token parameter required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!credentials.apiKey || !credentials.apiSecret) {
        return new Response(JSON.stringify({ error: "API Key and Secret not configured" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const tokenData = await getAccessToken(credentials.apiKey, credentials.apiSecret, requestToken);
        return new Response(JSON.stringify(tokenData), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // MCP protocol endpoint - handle POST requests
    if (req.method === "POST") {
      log('INFO', 'Handling MCP POST request');
      const body = await req.json();
      log('DEBUG', 'MCP request body', { method: body.method, id: body.id });

      // MCP Initialize
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: "paytm-money-mcp",
              version: "2.0.0",
              authRequired: "OAuth login required. Use 'get_login_url' tool first.",
            },
          },
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // List tools
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: tools.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Call tool
      if (body.method === "tools/call") {
        const toolName = body.params?.name;
        const toolParams = body.params?.arguments || {};

        log('INFO', `MCP tools/call request`, { toolName, toolParams });

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
          if (!credentials.apiKey || !credentials.apiSecret) {
            throw new Error("Paytm Money API Key and Secret not configured. Set PAYTM_MONEY_API_KEY and PAYTM_MONEY_SECRET in environment.");
          }

          const result = await handleTool(toolName, {
            apiKey: credentials.apiKey,
            apiSecret: credentials.apiSecret,
            accessToken: credentials.accessToken,
          }, toolParams);

          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
              }],
            },
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (error: any) {
          log('ERROR', `Tool ${toolName} failed`, { error: error.message });
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32603, message: error.message },
          }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Unknown method
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
      message: "Paytm Money MCP Server v2.0 - OAuth Required",
      documentation: {
        authFlow: [
          "1. GET ?action=login_url&state=<random> - Get OAuth login URL",
          "2. Visit login URL and authenticate in browser",
          "3. GET ?action=exchange_token&request_token=<token> - Get access_token",
          "4. Set access_token in X-Paytm-Access-Token header for subsequent calls",
        ],
        endpoints: {
          status: "GET ?action=status",
          login_url: "GET ?action=login_url&state=<random>",
          exchange_token: "GET ?action=exchange_token&request_token=<token>",
          mcp: "POST / (MCP protocol)",
        },
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    log('ERROR', 'Unhandled error', { error: error.message, stack: error.stack });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
