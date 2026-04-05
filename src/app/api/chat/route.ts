
import { OpenAIStream, StreamingTextResponse } from 'ai';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { messages, model, temperature, max_tokens, stream } = await req.json();

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return new Response('Perplexity API key not set', { status: 500 });
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

    