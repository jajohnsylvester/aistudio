import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// Paytm Money API configuration
const PAYTM_API_BASE = "https://developer.paytmmoney.com";
const PAYTM_LOGIN_BASE = "https://login.paytmmoney.com";

async function getAccessToken(apiKey: string, apiSecret: string, requestToken?: string): Promise<string> {
  // If request token is provided, exchange it for access token
  if (requestToken) {
    const response = await fetch(`${PAYTM_LOGIN_BASE}/v1/api/merchant-verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        api_secret: apiSecret,
        request_token: requestToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to verify request token: ${await response.text()}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  // Otherwise, use the pre-generated access token from environment
  const accessToken = Deno.env.get("PAYTM_ACCESS_TOKEN");
  if (!accessToken) {
    throw new Error("PAYTM_ACCESS_TOKEN not set and no request_token provided");
  }

  return accessToken;
}

async function callPaytmAPI(endpoint: string, accessToken: string, method: string = "GET", body?: any): Promise<any> {
  const url = `${PAYTM_API_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // Add JWT token header if available
  const jwtToken = Deno.env.get("PAYTM_JWT_TOKEN");
  if (jwtToken) {
    headers["jwt-token"] = jwtToken;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Paytm API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
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
async function handleTool(name: string, accessToken: string): Promise<any> {
  switch (name) {
    case "get_holdings":
      return await callPaytmAPI("/v2/holdings", accessToken);

    case "get_holdings_value":
      return await callPaytmAPI("/v2/holdings/value", accessToken);

    case "get_user_details":
      return await callPaytmAPI("/v1/user/details", accessToken);

    case "get_positions":
      return await callPaytmAPI("/v1/positions", accessToken);

    case "get_orders":
      return await callPaytmAPI("/v1/orders", accessToken);

    case "get_trade_book":
      return await callPaytmAPI("/v1/tradebook", accessToken);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    const apiKey = Deno.env.get("PAYTM_MONEY_API_KEY");
    const apiSecret = Deno.env.get("PAYTM_MONEY_SECRET");
    const proxyUrl = Deno.env.get("WEBSHARE_PROXY_URL");

    // Check connectivity status
    if (path === "/status" || path === "/health") {
      const status = {
        connected: !!(apiKey && apiSecret),
        apiKeyConfigured: !!apiKey,
        secretConfigured: !!apiSecret,
        proxyConfigured: !!proxyUrl,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MCP Initialize endpoint
    if (path === "/mcp" && req.method === "POST") {
      const body = await req.json();

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
              version: "1.0.0",
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

      if (body.method === "tools/call") {
        const toolName = body.params?.name;
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
            throw new Error("Paytm Money API credentials not configured");
          }

          const accessToken = await getAccessToken(apiKey, apiSecret);
          const result = await handleTool(toolName, accessToken);

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
    }

    // Direct API endpoint for testing
    if (path === "/api/holdings" && req.method === "GET") {
      try {
        if (!apiKey || !apiSecret) {
          throw new Error("Paytm Money API credentials not configured");
        }

        const accessToken = await getAccessToken(apiKey, apiSecret);
        const result = await callPaytmAPI("/v2/holdings", accessToken);

        return new Response(JSON.stringify(result), {
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

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
