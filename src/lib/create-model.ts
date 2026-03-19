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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProviderFactory = (opts?: { apiKey?: string; baseURL?: string }) => (modelId: string) => any;

const providers: Record<string, ProviderFactory> = {
  anthropic: (opts) => createAnthropic(opts),
  openai: (opts) => createOpenAI(opts),
  google: (opts) => createGoogleGenerativeAI(opts),
  xai: (opts) => createXai(opts),
  mistral: (opts) => createMistral(opts),
  groq: (opts) => createGroq(opts),
  deepseek: (opts) => createDeepSeek(opts),
  perplexity: (opts) => createPerplexity(opts),
  cohere: (opts) => createCohere(opts),
  cerebras: (opts) => createCerebras(opts),
  togetherai: (opts) => createTogetherAI(opts),
  fireworks: (opts) => createFireworks(opts),
  moonshotai: (opts) => createMoonshotAI(opts),
  alibaba: (opts) => createAlibaba(opts),
  deepinfra: (opts) => createDeepInfra(opts),
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
