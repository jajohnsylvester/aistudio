import { createClient } from '@supabase/supabase-js';

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

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

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
  return Date.now() >= ((payload.exp as number) * 1000 - 5 * 60 * 1000);
}

function getTokenExpiryTime(token: string): Date | null {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? new Date((payload.exp as number) * 1000) : null;
}

export async function getAccessTokenFromDB() {
  try {
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
  } catch { return { accessToken: null, isExpired: true, expiresAt: null }; }
}

export async function saveAccessTokenToDB(tokenData: { access_token: string; public_access_token?: string; read_access_token?: string }) {
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

export async function callPaytmAPI(endpoint: string, accessToken: string): Promise<unknown> {
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
