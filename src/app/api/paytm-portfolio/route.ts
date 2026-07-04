import { NextRequest, NextResponse } from 'next/server';

/**
 * Paytm Portfolio Route - delegates to the embedded MCP server and ADK agent.
 * Kept for backwards compatibility with the auth callback page.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const baseUrl = new URL(request.url).origin;

  // Delegate status, login_url, exchange_token to the MCP server
  if (action === 'status' || action === 'login_url' || action === 'exchange_token') {
    const mcpUrl = new URL(`${baseUrl}/api/paytm-mcp`);
    searchParams.forEach((value, key) => mcpUrl.searchParams.set(key, value));
    const response = await fetch(mcpUrl.toString());
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  }

  // Delegate portfolio data to the ADK agent
  if (action === 'portfolio') {
    const agentUrl = new URL(`${baseUrl}/api/paytm-agent`);
    agentUrl.searchParams.set('action', 'portfolio');
    const response = await fetch(agentUrl.toString());
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
}
