
import { OpenAIStream, StreamingTextResponse } from 'ai';

export const runtime = 'edge';

// MCP URL for fetching secrets
const PAYTM_MCP_URL = process.env.PAYTM_MCP_URL || 'https://kkzurvqbtguldcppujtn.supabase.co/functions/v1/paytm-mcp';

// Cache for secrets
let secretsCache: { perplexityApiKey: string | null } | null = null;
let secretsCacheTime = 0;
const SECRETS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fetch Perplexity API key from Supabse secrets
async function getPerplexityApiKey(): Promise<string | null> {
  const now = Date.now();

  // Return cached secret if still valid
  if (secretsCache && (now - secretsCacheTime) < SECRETS_CACHE_TTL) {
    return secretsCache.perplexityApiKey;
  }

  try {
    const response = await fetch(`${PAYTM_MCP_URL}?action=secrets`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      secretsCache = {
        perplexityApiKey: data.perplexityApiKey || null,
      };
      secretsCacheTime = now;
      return secretsCache.perplexityApiKey;
    }
  } catch {
    // Fallback to environment variable
  }

  return process.env.PERPLEXITY_API_KEY || null;
}

export async function POST(req: Request) {
  try {
    const { messages, model, temperature, max_tokens, stream } = await req.json();

    const apiKey = await getPerplexityApiKey();
    if (!apiKey) {
      return new Response('Perplexity API key not configured. Add PERPLEXITY_API_KEY to Supabase secrets.', { status: 500 });
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: max_tokens,
        stream: stream,
      }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        return new Response(`Error from Perplexity API: ${errorText}`, { status: response.status });
    }

    if (stream) {
        const stream = OpenAIStream(response);
        return new StreamingTextResponse(stream);
    } else {
        const data = await response.json();
        return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

  } catch (error: any) {
    return new Response(`Error: ${error.message || 'Something went wrong.'}`, { status: 500 });
  }
}
