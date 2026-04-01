import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createMistral } from "@ai-sdk/mistral";
import { createGroq } from "@ai-sdk/groq";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createCohere } from "@ai-sdk/cohere";
import { createCerebras } from "@ai-sdk/cerebras";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createFireworks } from "@ai-sdk/fireworks";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createAlibaba } from "@ai-sdk/alibaba";
import { createDeepInfra } from "@ai-sdk/deepinfra";

import type { CustomApiConfig } from "@/store/settings-store";
import { OPENROUTER_BASE_URL, getOpenRouterHeaders } from "@/lib/openrouter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProviderFactory = (opts?: { apiKey?: string; baseURL?: string; headers?: Record<string, string> }) => (modelId: string) => any;

const REQUEST_TIMEOUT_MS = 800_000; // ~13 min — match maxDuration on API routes

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

interface ProviderOpts {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

function withTimeout(opts?: ProviderOpts): ProviderOpts & { fetch: typeof fetch } {
  return { ...opts, fetch: fetchWithTimeout as typeof fetch };
}

const providers: Record<string, ProviderFactory> = {
  anthropic: (opts) => createAnthropic(withTimeout(opts)),
  openai: (opts) => createOpenAI(withTimeout(opts)),
  google: (opts) => createGoogleGenerativeAI(withTimeout(opts)),
  xai: (opts) => createXai(withTimeout(opts)),
  mistral: (opts) => createMistral(withTimeout(opts)),
  groq: (opts) => createGroq(withTimeout(opts)),
  deepseek: (opts) => createDeepSeek(withTimeout(opts)),
  perplexity: (opts) => createPerplexity(withTimeout(opts)),
  cohere: (opts) => createCohere(withTimeout(opts)),
  cerebras: (opts) => createCerebras(withTimeout(opts)),
  togetherai: (opts) => createTogetherAI(withTimeout(opts)),
  fireworks: (opts) => createFireworks(withTimeout(opts)),
  moonshotai: (opts) => createMoonshotAI(withTimeout(opts)),
  alibaba: (opts) => createAlibaba(withTimeout(opts)),
  deepinfra: (opts) => createDeepInfra(withTimeout(opts)),
  openrouter: (opts) =>
    createOpenAI({
      ...withTimeout({
        ...opts,
        baseURL: opts?.baseURL ?? OPENROUTER_BASE_URL,
        headers: {
          ...(getOpenRouterHeaders() ?? {}),
          ...(opts?.headers ?? {}),
        },
      }),
      name: "openrouter",
    }).chat,
};

const CUSTOM_PROVIDER_PREFIX = "custom:";

export function createModel(modelStr: string, apiKey?: string, customConfig?: CustomApiConfig) {
  // Handle custom API provider format: "custom:api-id:model-id"
  if (modelStr.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    if (!customConfig) {
      throw new Error("Custom API configuration not found. Please check your custom API settings.");
    }

    const afterPrefix = modelStr.slice(CUSTOM_PROVIDER_PREFIX.length);
    const colonIdx = afterPrefix.indexOf(":");
    const modelId = colonIdx === -1 ? afterPrefix : afterPrefix.slice(colonIdx + 1);

    const providerType = customConfig.type || "anthropic";
    const factory = providers[providerType];
    if (factory) {
      const finalApiKey = customConfig.apiKey || apiKey;
      if (!finalApiKey) {
        throw new Error(`API key is required for custom API "${customConfig.name}". Please add an API key in the custom API settings.`);
      }
      const provider = factory({
        apiKey: finalApiKey,
        baseURL: customConfig.endpoint,
      });
      return provider(modelId);
    }
  }

  // Standard provider format: "provider:model-id"
  const idx = modelStr.indexOf(":");
  const providerId = idx === -1 ? "anthropic" : modelStr.slice(0, idx);
  const modelId = idx === -1 ? modelStr : modelStr.slice(idx + 1);

  const factory = providers[providerId] ?? providers.anthropic;
  const provider = factory(apiKey ? { apiKey } : undefined);
  return provider(modelId);
}

export function isAnthropicModel(modelStr: string): boolean {
  return modelStr.startsWith("anthropic:") || !modelStr.includes(":");
}
