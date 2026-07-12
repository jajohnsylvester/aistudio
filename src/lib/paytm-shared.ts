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

/**
 * Structured logger for debugging Paytm API interactions.
 */
export function logDebug(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', message: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data ? { data } : {}),
  };
  console.log(JSON.stringify(entry));
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString());
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) {
    logDebug('WARN', 'Token has no exp claim or is unparseable; treating as expired');
    return true;
  }
  const expiryMs = (payload.exp as number) * 1000;
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  const now = Date.now();
  const expired = now >= (expiryMs - bufferMs);
  logDebug('DEBUG', 'Token expiry check', {
    now: new Date(now).toISOString(),
    expiresAt: new Date(expiryMs).toISOString(),
    expired,
  });
  return expired;
}

function getTokenExpiryTime(token: string): Date | null {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? new Date((payload.exp as number) * 1000) : null;
}

export async function getAccessTokenFromMemory() {
  if (!tokenStore.access_token) {
    logDebug('DEBUG', 'No access token found in memory store');
    return { accessToken: null, isExpired: true, expiresAt: null };
  }

  const isExpired = isTokenExpired(tokenStore.access_token);
  const expiresAt = getTokenExpiryTime(tokenStore.access_token);

  return {
    accessToken: tokenStore.access_token,
    isExpired,
    expiresAt,
  };
}

export async function saveAccessTokenToMemory(tokenData: {
  access_token: string;
  public_access_token?: string;
  read_access_token?: string;
}) {
  logDebug('INFO', 'Saving access token to memory store', {
    hasPublicToken: !!tokenData.public_access_token,
    hasReadToken: !!tokenData.read_access_token,
  });
  tokenStore = {
    access_token: tokenData.access_token,
    public_access_token: tokenData.public_access_token || null,
    read_access_token: tokenData.read_access_token || null,
    created_at: new Date(),
  };
  const expiresAt = getTokenExpiryTime(tokenData.access_token);
  logDebug('INFO', 'Access token saved', { expiresAt: expiresAt?.toISOString() });
}

export async function clearAccessTokenFromMemory() {
  logDebug('INFO', 'Clearing access token from memory store');
  tokenStore = {
    access_token: null,
    public_access_token: null,
    read_access_token: null,
    created_at: null,
  };
}

export async function callPaytmAPI(endpoint: string, accessToken: string): Promise<unknown> {
  logDebug('INFO', 'Calling Paytm API', { endpoint });

  const headers: Record<string, string> = {
    'x-jwt-token': accessToken,
    'Content-Type': 'application/json',
    'openapi-client-src': 'sdk',
  };

  const response = await fetch(`${PAYTM_API_HOST}${endpoint}`, {
    headers,
  });

  logDebug('DEBUG', 'Paytm API response received', {
    endpoint,
    status: response.status,
    statusText: response.statusText,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 400 || response.status === 401) {
      logDebug('ERROR', 'Paytm API returned auth error', {
        status: response.status,
        endpoint,
        errorBody,
      });
      throw new Error('Access token expired. Please re-authenticate.');
    }
    if (response.status === 403) {
      logDebug('ERROR', 'Paytm API returned access denied', { endpoint, errorBody });
      throw new Error('Access denied. Check API permissions.');
    }
    if (response.status === 429) {
      logDebug('WARN', 'Paytm API rate limit exceeded', { endpoint });
      throw new Error('Rate limit exceeded. Try again later.');
    }
    logDebug('ERROR', 'Paytm API error', { status: response.status, endpoint, errorBody });
    throw new Error(`Paytm API error ${response.status}: ${errorBody}`);
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
  sector: string;
}
