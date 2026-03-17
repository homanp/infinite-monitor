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
import { isPlanProvider } from "@/lib/model-registry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProviderFactory = (opts?: { apiKey?: string }) => (modelId: string) => any;

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

export interface CreateModelOptions {
  apiKey?: string;
  planEndpoint?: string;
}

export function createModel(modelStr: string, optsOrApiKey?: string | CreateModelOptions) {
  const opts: CreateModelOptions =
    typeof optsOrApiKey === "string" ? { apiKey: optsOrApiKey } : optsOrApiKey ?? {};

  const idx = modelStr.indexOf(":");
  const providerId = idx === -1 ? "anthropic" : modelStr.slice(0, idx);
  const modelId = idx === -1 ? modelStr : modelStr.slice(idx + 1);

  if (isPlanProvider(providerId) && opts.planEndpoint) {
    const proxy = createOpenAI({
      baseURL: opts.planEndpoint,
      apiKey: opts.apiKey || "plan-subscription",
    });
    return proxy(modelId);
  }

  const factory = providers[providerId] ?? providers.anthropic;
  const provider = factory(opts.apiKey ? { apiKey: opts.apiKey } : undefined);
  return provider(modelId);
}

export function isAnthropicModel(modelStr: string): boolean {
  return modelStr.startsWith("anthropic:") || !modelStr.includes(":");
}
