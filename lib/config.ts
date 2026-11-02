import Anthropic from '@anthropic-ai/sdk';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api';

type Provider = { name: 'anthropic' | 'openrouter'; model: string; client: () => Anthropic };

/**
 * Claude is reached through the Anthropic SDK, either directly or through OpenRouter's
 * Anthropic-compatible endpoint. Keys are read here only and never sent to the browser.
 */
export function modelProvider(): Provider | null {
  if (process.env.DEMO_MODE === 'true') return null;

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      name: 'anthropic',
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      client: () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 120_000 }),
    };
  }

  if (process.env.OPENROUTER_API_KEY) {
    return {
      name: 'openrouter',
      model: process.env.ANTHROPIC_MODEL || 'anthropic/claude-haiku-5.5',
      client: () =>
        new Anthropic({
          baseURL: OPENROUTER_BASE_URL,
          apiKey: null,
          authToken: process.env.OPENROUTER_API_KEY,
          maxRetries: 1,
          timeout: 120_000,
          defaultHeaders: { 'X-Title': 'ClauseDesk' },
        }),
    };
  }

  return null;
}

export function isDemoMode() {
  return modelProvider() === null;
}
