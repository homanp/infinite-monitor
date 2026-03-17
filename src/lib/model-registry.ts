export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  envKey: string;
  models: ModelInfo[];
}

export interface PlanProviderInfo {
  id: string;
  name: string;
  description: string;
  defaultEndpoint: string;
  setupUrl: string;
  logoProvider: string;
  models: ModelInfo[];
}

function models(
  providerId: string,
  providerName: string,
  list: Array<[string, string]>
): ModelInfo[] {
  return list.map(([id, name]) => ({ id, name, providerId, providerName }));
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    models: models("anthropic", "Anthropic", [
      ["claude-opus-4-6", "Claude Opus 4.6"],
      ["claude-sonnet-4-6", "Claude Sonnet 4.6"],
      ["claude-sonnet-4-5", "Claude Sonnet 4.5"],
      ["claude-haiku-4-5", "Claude Haiku 4.5"],
    ]),
  },
  {
    id: "openai",
    name: "OpenAI",
    envKey: "OPENAI_API_KEY",
    models: models("openai", "OpenAI", [
      ["gpt-5.4", "GPT-5.4"],
      ["gpt-5.4-pro", "GPT-5.4 Pro"],
      ["gpt-5.3-codex", "GPT-5.3 Codex"],
      ["gpt-5-codex", "GPT-5 Codex"],
      ["gpt-5", "GPT-5"],
      ["gpt-5-mini", "GPT-5 Mini"],
      ["gpt-5-nano", "GPT-5 Nano"],
      ["gpt-4.1", "GPT-4.1"],
    ]),
  },
  {
    id: "google",
    name: "Google",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: models("google", "Google", [
      ["gemini-3.1-pro-preview", "Gemini 3.1 Pro"],
      ["gemini-3-flash-preview", "Gemini 3 Flash"],
      ["gemini-3.1-flash-lite-preview", "Gemini 3.1 Flash Lite"],
      ["gemini-2.5-pro", "Gemini 2.5 Pro"],
      ["gemini-2.5-flash", "Gemini 2.5 Flash"],
      ["gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite"],
    ]),
  },
  {
    id: "xai",
    name: "xAI",
    envKey: "XAI_API_KEY",
    models: models("xai", "xAI", [
      ["grok-4.20-beta-0309-reasoning", "Grok 4.20"],
      ["grok-4-1-fast-reasoning", "Grok 4.1 Fast"],
      ["grok-4-0709", "Grok 4"],
      ["grok-4-fast-reasoning", "Grok 4 Fast"],
      ["grok-3", "Grok 3"],
      ["grok-3-mini", "Grok 3 Mini"],
    ]),
  },
  {
    id: "moonshotai",
    name: "Moonshot AI",
    envKey: "MOONSHOT_API_KEY",
    models: models("moonshotai", "Moonshot AI", [
      ["kimi-k2.5", "Kimi K2.5"],
      ["kimi-k2-thinking", "Kimi K2 Thinking"],
    ]),
  },
  {
    id: "alibaba",
    name: "Alibaba",
    envKey: "ALIBABA_API_KEY",
    models: models("alibaba", "Alibaba", [
      ["qwen3-max", "Qwen3 Max"],
      ["qwen-plus", "Qwen Plus"],
    ]),
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    envKey: "DEEPINFRA_API_KEY",
    models: models("deepinfra", "DeepInfra", [
      ["meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", "Llama 4 Maverick"],
      ["meta-llama/Llama-4-Scout-17B-16E-Instruct", "Llama 4 Scout"],
      ["meta-llama/Llama-3.3-70B-Instruct", "Llama 3.3 70B"],
      ["deepseek-ai/DeepSeek-R1", "DeepSeek R1"],
    ]),
  },
  {
    id: "mistral",
    name: "Mistral",
    envKey: "MISTRAL_API_KEY",
    models: models("mistral", "Mistral", [
      ["mistral-large-latest", "Mistral Large"],
      ["pixtral-large-latest", "Pixtral Large"],
      ["magistral-medium-2506", "Magistral Medium"],
      ["mistral-small-latest", "Mistral Small"],
    ]),
  },
  {
    id: "groq",
    name: "Groq",
    envKey: "GROQ_API_KEY",
    models: models("groq", "Groq", [
      ["meta-llama/llama-4-scout-17b-16e-instruct", "Llama 4 Scout"],
      ["llama-3.3-70b-versatile", "Llama 3.3 70B"],
      ["deepseek-r1-distill-llama-70b", "DeepSeek R1 Distill 70B"],
      ["qwen-qwq-32b", "Qwen QwQ 32B"],
    ]),
  },
  {
    id: "cerebras",
    name: "Cerebras",
    envKey: "CEREBRAS_API_KEY",
    models: models("cerebras", "Cerebras", [
      ["llama3.3-70b", "Llama 3.3 70B"],
      ["qwen-3-32b", "Qwen 3 32B"],
    ]),
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    models: models("deepseek", "DeepSeek", [
      ["deepseek-chat", "DeepSeek Chat"],
      ["deepseek-reasoner", "DeepSeek Reasoner"],
    ]),
  },
  {
    id: "perplexity",
    name: "Perplexity",
    envKey: "PERPLEXITY_API_KEY",
    models: models("perplexity", "Perplexity", [
      ["sonar-pro", "Sonar Pro"],
      ["sonar", "Sonar"],
    ]),
  },
  {
    id: "cohere",
    name: "Cohere",
    envKey: "COHERE_API_KEY",
    models: models("cohere", "Cohere", [
      ["command-a-03-2025", "Command A"],
      ["command-a-reasoning-08-2025", "Command A Reasoning"],
      ["command-r-plus", "Command R+"],
    ]),
  },
  {
    id: "togetherai",
    name: "Together AI",
    envKey: "TOGETHER_AI_API_KEY",
    models: models("togetherai", "Together AI", [
      ["meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo", "Llama 3.3 70B"],
      ["Qwen/Qwen2.5-72B-Instruct-Turbo", "Qwen 2.5 72B"],
      ["deepseek-ai/DeepSeek-V3", "DeepSeek V3"],
    ]),
  },
  {
    id: "fireworks",
    name: "Fireworks",
    envKey: "FIREWORKS_API_KEY",
    models: models("fireworks", "Fireworks", [
      ["accounts/fireworks/models/kimi-k2-instruct", "Kimi K2"],
      ["accounts/fireworks/models/deepseek-r1", "DeepSeek R1"],
      ["accounts/fireworks/models/deepseek-v3", "DeepSeek V3"],
      ["accounts/fireworks/models/llama-v3p3-70b-instruct", "Llama 3.3 70B"],
      ["accounts/fireworks/models/qwen3-coder-480b-a35b-instruct", "Qwen3 Coder 480B"],
    ]),
  },
];

export const PLAN_PROVIDERS: PlanProviderInfo[] = [
  {
    id: "claude-max",
    name: "Claude Max",
    description: "Use your Claude Pro/Max subscription via a CLI proxy (e.g. CLIProxyAPI)",
    defaultEndpoint: "http://localhost:8080/v1",
    setupUrl: "https://github.com/router-for-me/CLIProxyAPI",
    logoProvider: "anthropic",
    models: models("claude-max", "Claude Max", [
      ["claude-opus-4-6", "Claude Opus 4.6"],
      ["claude-sonnet-4-6", "Claude Sonnet 4.6"],
      ["claude-sonnet-4-5", "Claude Sonnet 4.5"],
      ["claude-haiku-4-5", "Claude Haiku 4.5"],
    ]),
  },
  {
    id: "gemini-plan",
    name: "Gemini Plan",
    description: "Use your Gemini Pro/Ultra subscription via a CLI proxy (e.g. CLIProxyAPI)",
    defaultEndpoint: "http://localhost:8080/v1",
    setupUrl: "https://github.com/router-for-me/CLIProxyAPI",
    logoProvider: "google",
    models: models("gemini-plan", "Gemini Plan", [
      ["gemini-2.5-pro", "Gemini 2.5 Pro"],
      ["gemini-2.5-flash", "Gemini 2.5 Flash"],
      ["gemini-3.1-pro-preview", "Gemini 3.1 Pro"],
      ["gemini-3-flash-preview", "Gemini 3 Flash"],
    ]),
  },
  {
    id: "codex-plan",
    name: "Codex / ChatGPT",
    description: "Use your ChatGPT Plus/Pro or Codex subscription via a CLI proxy (e.g. CLIProxyAPI)",
    defaultEndpoint: "http://localhost:8080/v1",
    setupUrl: "https://github.com/router-for-me/CLIProxyAPI",
    logoProvider: "openai",
    models: models("codex-plan", "Codex / ChatGPT", [
      ["gpt-5.4", "GPT-5.4"],
      ["gpt-5.4-pro", "GPT-5.4 Pro"],
      ["gpt-5.3-codex", "GPT-5.3 Codex"],
      ["gpt-5-codex", "GPT-5 Codex"],
      ["gpt-5", "GPT-5"],
      ["gpt-5-mini", "GPT-5 Mini"],
    ]),
  },
];

export const ALL_MODELS = PROVIDERS.flatMap((p) => p.models);

export const ALL_PLAN_MODELS = PLAN_PROVIDERS.flatMap((p) => p.models);

export const DEFAULT_MODEL = "anthropic:claude-sonnet-4-6";

export function findProvider(providerId: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === providerId);
}

export function findPlanProvider(providerId: string): PlanProviderInfo | undefined {
  return PLAN_PROVIDERS.find((p) => p.id === providerId);
}

export function isPlanProvider(providerId: string): boolean {
  return PLAN_PROVIDERS.some((p) => p.id === providerId);
}

export function parseModelString(modelStr: string): { providerId: string; modelId: string } {
  const idx = modelStr.indexOf(":");
  if (idx === -1) return { providerId: "anthropic", modelId: modelStr };
  return { providerId: modelStr.slice(0, idx), modelId: modelStr.slice(idx + 1) };
}
