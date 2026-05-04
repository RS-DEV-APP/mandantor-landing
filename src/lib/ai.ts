// Schmaler Anthropic-Claude-API-Wrapper. Wir nutzen die /v1/messages-REST-API
// direkt (kein SDK), damit wir in der Cloudflare-Workers-Sandbox bleiben.
// PII wird vorher in lib/pii_redact.ts maskiert — dieser Wrapper trifft keine
// Annahmen über den Inhalt.

const API_URL = 'https://api.anthropic.com/v1/messages';

export type ClaudeModel =
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7';

export const DEFAULT_MODEL: ClaudeModel = 'claude-haiku-4-5-20251001';

export type ClaudeMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ClaudeResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export class AiNotConfiguredError extends Error {
  constructor() { super('ANTHROPIC_API_KEY missing'); }
}

export function isAiConfigured(env: { ANTHROPIC_API_KEY?: string }): boolean {
  return !!env.ANTHROPIC_API_KEY;
}

export async function callClaude(
  env: { ANTHROPIC_API_KEY?: string },
  opts: {
    model?: ClaudeModel;
    system?: string;
    messages: ClaudeMessage[];
    maxTokens?: number;
    temperature?: number;
  },
): Promise<ClaudeResult> {
  if (!env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
  const model = opts.model ?? DEFAULT_MODEL;
  const body = {
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.2,
    system: opts.system,
    messages: opts.messages,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API ${res.status}: ${err.slice(0, 300)}`);
    }
    const data = await res.json() as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text!)
      .join('\n')
      .trim();
    return {
      text,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      model: data.model ?? model,
    };
  } finally {
    clearTimeout(timer);
  }
}
