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
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Paytm-Api-Key, X-Paytm-Secret",
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

// Paytm Money API configuration
const PAYTM_API_BASE = "https://developer.paytmmoney.com";

// Get credentials from headers (passed from Next.js API) or environment
function getCredentials(req: Request): { apiKey: string | null; apiSecret: string | null } {
  // Try headers first (from Next.js API route)
  const headerApiKey = req.headers.get("X-Paytm-Api-Key");
  const headerApiSecret = req.headers.get("X-Paytm-Secret");

  log('DEBUG', 'Checking credentials from headers', {
    hasHeaderApiKey: !!headerApiKey,
    hasHeaderApiSecret: !!headerApiSecret,
    headerApiKeyLength: headerApiKey?.length || 0,
    headerApiSecretLength: headerApiSecret?.length || 0,
  });

  // Fall back to environment variables
  const envApiKey = Deno.env.get("PAYTM_MONEY_API_KEY");
  const envApiSecret = Deno.env.get("PAYTM_MONEY_SECRET");

  log('DEBUG', 'Checking credentials from env', {
    hasEnvApiKey: !!envApiKey,
    hasEnvApiSecret: !!envApiSecret,
  });

  return {
    apiKey: headerApiKey || envApiKey || null,
    apiSecret: headerApiSecret || envApiSecret || null,
  };
}

async function callPaytmAPI(endpoint: string, apiKey: string, apiSecret: string, method: string = "GET", body?: any): Promise<any> {
  const url = `${PAYTM_API_BASE}${endpoint}`;

  log('INFO', `Calling Paytm API`, {
    endpoint,
    method,
    url,
    hasApiKey: !!apiKey,
    hasApiSecret: !!apiSecret,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : 'none',
  });

  // Paytm Money uses API key and Secret for authentication
  // Try multiple auth header variations since documentation may vary
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
    "X-Api-Secret": apiSecret,
    "api_key": apiKey,
    "api_secret": apiSecret,
  };

  log('DEBUG', 'Request headers (redacted)', {
    hasXApiKey: !!headers["X-Api-Key"],
    hasXApiSecret: !!headers["X-Api-Secret"],
    hasApiKeyHeader: !!headers["api_key"],
    hasApiSecretHeader: !!headers["api_secret"],
  });

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
    log('DEBUG', 'Request body', { body });
  }

  const startTime = Date.now();
  log('INFO', 'Making HTTP request to Paytm API', { url, method });

  const response = await fetch(url, options);
  const elapsed = Date.now() - startTime;

  log('INFO', 'Received response from Paytm API', {
    status: response.status,
    statusText: response.statusText,
    elapsedMs: elapsed,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('ERROR', 'Paytm API error response', {
      status: response.status,
      statusText: response.statusText,
      responseBody: errorText,
      endpoint,
    });
    throw new Error(`Paytm API error: ${response.status} - ${errorText}`);
  }

  const responseData = await response.json();
  log('DEBUG', 'Paytm API success response', {
    responseKeys: Object.keys(responseData || {}),
    responsePreview: JSON.stringify(responseData).substring(0, 500),
  });

  return responseData;
}

// Tool definitions
const tools: MCPTool[] = [
  {
    name: "get_holdings",
    description: "Get the user's stock holdings portfolio from Paytm Money. Returns all equity delivery stocks currently held.",
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
];

// Tool handlers
async function handleTool(name: string, apiKey: string, apiSecret: string): Promise<any> {
  log('INFO', `Handling tool: ${name}`);

  switch (name) {
    case "get_holdings":
      return await callPaytmAPI("/v2/holdings", apiKey, apiSecret);

    case "get_holdings_value":
      return await callPaytmAPI("/v2/holdings/value", apiKey, apiSecret);

    case "get_user_details":
      return await callPaytmAPI("/v1/user/details", apiKey, apiSecret);

    case "get_positions":
      return await callPaytmAPI("/v1/positions", apiKey, apiSecret);

    case "get_orders":
      return await callPaytmAPI("/v1/orders", apiKey, apiSecret);

    case "get_trade_book":
      return await callPaytmAPI("/v1/tradebook", apiKey, apiSecret);

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
    log('DEBUG', 'Handling CORS preflight request');
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  // Log all incoming request details
  const incomingHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    // Filter out sensitive values but show we received them
    if (key.toLowerCase().includes('paytm') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')) {
      incomingHeaders[key] = `${value.substring(0, 10)}...`;
    } else {
      incomingHeaders[key] = value;
    }
  });

  log('DEBUG', 'Request details', {
    pathname,
    searchParams: Object.fromEntries(url.searchParams),
    headers: incomingHeaders,
  });

  try {
    const credentials = getCredentials(req);
    const proxyUrl = Deno.env.get("WEBSHARE_PROXY_URL");

    // Check connectivity status
    const action = url.searchParams.get('action');
    const isStatusRequest = pathname.includes('/status') || pathname.includes('/health') || action === 'status' || action === 'health';

    if (isStatusRequest) {
      log('INFO', 'Handling status request');
      const status = {
        connected: !!(credentials.apiKey && credentials.apiSecret),
        apiKeyConfigured: !!credentials.apiKey,
        secretConfigured: !!credentials.apiSecret,
        proxyConfigured: !!proxyUrl,
        timestamp: new Date().toISOString(),
      };

      log('INFO', 'Status check result', status);

      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get holdings endpoint
    const isHoldingsRequest = pathname.includes('/holdings') && req.method === "GET";

    if (isHoldingsRequest) {
      log('INFO', 'Handling direct holdings request');
      try {
        if (!credentials.apiKey || !credentials.apiSecret) {
          log('WARN', 'Credentials missing for holdings request');
          throw new Error("Paytm Money API credentials not configured");
        }

        const result = await callPaytmAPI("/v2/holdings", credentials.apiKey, credentials.apiSecret);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        log('ERROR', 'Holdings request failed', { error: error.message, stack: error.stack });
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
      log('DEBUG', 'MCP request body', { method: body.method, id: body.id, params: body.params });

      // MCP Initialize
      if (body.method === "initialize") {
        log('INFO', 'MCP initialize request');
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
              version: "1.0.0",
            },
          },
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // List tools
      if (body.method === "tools/list") {
        log('INFO', 'MCP tools/list request');
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
        log('INFO', `MCP tools/call request`, { toolName });

        if (!toolName) {
          log('WARN', 'Missing tool name in tools/call');
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
            log('ERROR', 'Credentials not configured for tool call', { toolName });
            throw new Error("Paytm Money API credentials not configured. Set PAYTM_MONEY_API_KEY and PAYTM_MONEY_SECRET in environment or pass via headers.");
          }

          log('INFO', `Executing tool: ${toolName}`);
          const result = await handleTool(toolName, credentials.apiKey, credentials.apiSecret);
          log('INFO', `Tool ${toolName} executed successfully`);

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
          log('ERROR', `Tool ${toolName} execution failed`, {
            error: error.message,
            stack: error.stack,
          });
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
      log('WARN', 'Unknown MCP method', { method: body.method });
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32601, message: `Unknown method: ${body.method}` },
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default response for GET requests to root
    log('INFO', 'Returning default root response');
    return new Response(JSON.stringify({
      status: "ok",
      message: "Paytm Money MCP Server is running",
      endpoints: {
        status: "GET /?action=status",
        holdings: "GET /holdings",
        mcp: "POST / (MCP protocol)",
      },
      credentials: {
        apiKeyConfigured: !!credentials.apiKey,
        secretConfigured: !!credentials.apiSecret,
        proxyConfigured: !!proxyUrl,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    log('ERROR', 'Unhandled error in request handler', {
      error: error.message,
      stack: error.stack,
    });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
