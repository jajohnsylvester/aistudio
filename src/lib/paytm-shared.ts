/**
 * Paytm Money Shared Utilities - In-Memory Token Storage
 * No database dependency - tokens stored in process memory
 */

// In-memory token storage (persists for the lifetime of the server process)
let tokenStore: {
  access_token: string | null;
  public_access_token: string | null;
  read_access_token: string | null;
  created_at: Date | null;
} = {
  access_token: null,
  public_access_token: null,
  read_access_token: null,
  created_at: null,
};

export const PAYTM_API_HOST = 'https://developer.paytmmoney.com';
export const PAYTM_LOGIN_URL = 'https://login.paytmmoney.com/merchant-login';

export const API_ROUTES = {
  access_token: '/accounts/v2/gettoken',
  user_details: '/accounts/v1/user/details',
  holdings: '/holdings/v1/get-user-holdings-data',
  holdings_value: '/holdings/v1/get-holdings-value',
  position: '/orders/v1/position',
  order_book: '/orders/v1/order-book',
} as const;

export const MCP_TOOLS = [
  { name: 'get_holdings', description: 'Get user stock holdings portfolio' },
  { name: 'get_holdings_value', description: 'Get total market value of holdings' },
  { name: 'get_user_details', description: 'Get user profile and details' },
  { name: 'get_positions', description: 'Get open intraday positions' },
  { name: 'get_orders', description: 'Get order book' },
];

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString());
  } catch { return null; }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  // Consider token expired 5 minutes before actual expiry
  return Date.now() >= ((payload.exp as number) * 1000 - 5 * 60 * 1000);
}

function getTokenExpiryTime(token: string): Date | null {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? new Date((payload.exp as number) * 1000) : null;
}

export async function getAccessTokenFromMemory() {
  if (!tokenStore.access_token) {
    return { accessToken: null, isExpired: true, expiresAt: null };
  }

  return {
    accessToken: tokenStore.access_token,
    isExpired: isTokenExpired(tokenStore.access_token),
    expiresAt: getTokenExpiryTime(tokenStore.access_token),
  };
}

export async function saveAccessTokenToMemory(tokenData: {
  access_token: string;
  public_access_token?: string;
  read_access_token?: string;
}) {
  tokenStore = {
    access_token: tokenData.access_token,
    public_access_token: tokenData.public_access_token || null,
    read_access_token: tokenData.read_access_token || null,
    created_at: new Date(),
  };
}

export async function callPaytmAPI(endpoint: string, accessToken: string): Promise<unknown> {
  const proxyUrl = process.env.WEBSHARE_PROXY_URL;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${PAYTM_API_HOST}${endpoint}`, {
    headers,
  });

  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new Error('Access token expired. Please re-authenticate.');
    }
    if (response.status === 403) {
      throw new Error('Access denied. Check API permissions.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Try again later.');
    }
    const errorText = await response.text();
    throw new Error(`Paytm API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

export interface Holding {
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
