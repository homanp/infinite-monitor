import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  ALL_MODELS,
  DEFAULT_MODEL,
  findProvider,
  getBuiltinProviders,
  OPENROUTER_BYOK_MODELS,
  OPENROUTER_DEFAULT_STARTER_MODEL_ID,
  OPENROUTER_PROVIDER_ID,
  OPENROUTER_STARTER_MODELS,
  parseModelString,
} from "@/lib/model-registry";

describe("parseModelString", () => {
  it("splits provider and model on colon", () => {
    expect(parseModelString("openai:gpt-5.4")).toEqual({
      providerId: "openai",
      modelId: "gpt-5.4",
    });
  });

  it("defaults to anthropic when no colon is present", () => {
    expect(parseModelString("claude-sonnet-4-6")).toEqual({
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
    });
  });

  it("handles model IDs that contain colons after the first", () => {
    expect(parseModelString("fireworks:accounts/fireworks/models/deepseek-r1")).toEqual({
      providerId: "fireworks",
      modelId: "accounts/fireworks/models/deepseek-r1",
    });
  });

  it("handles empty string", () => {
    expect(parseModelString("")).toEqual({
      providerId: "anthropic",
      modelId: "",
    });
  });
});

describe("findProvider", () => {
  it("returns the provider for a known ID", () => {
    const provider = findProvider("anthropic");
    expect(provider).toBeDefined();
    expect(provider!.name).toBe("Anthropic");
  });

  it("returns undefined for an unknown ID", () => {
    expect(findProvider("nonexistent")).toBeUndefined();
  });

  it("finds every registered provider", () => {
    for (const p of PROVIDERS) {
      expect(findProvider(p.id)).toBe(p);
    }
  });
});

describe("PROVIDERS", () => {
  it("has at least one provider", () => {
    expect(PROVIDERS.length).toBeGreaterThan(0);
  });

  it("has no duplicate provider IDs", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every provider has at least one model", () => {
    for (const p of PROVIDERS) {
      expect(p.models.length).toBeGreaterThan(0);
    }
  });

  it("every model references its parent provider", () => {
    for (const p of PROVIDERS) {
      for (const m of p.models) {
        expect(m.providerId).toBe(p.id);
        expect(m.providerName).toBe(p.name);
      }
    }
  });

  it("every provider has an envKey", () => {
    for (const p of PROVIDERS) {
      expect(p.envKey).toBeTruthy();
    }
  });

  it("includes GPT-5.4 mini and nano for OpenAI", () => {
    const openAI = findProvider("openai");
    expect(openAI).toBeDefined();

    const modelIds = new Set(openAI!.models.map((m) => m.id));
    expect(modelIds.has("gpt-5.4-mini")).toBe(true);
    expect(modelIds.has("gpt-5.4-nano")).toBe(true);
  });

  it("registers OpenRouter with starter and BYOK models", () => {
    const openRouter = findProvider(OPENROUTER_PROVIDER_ID);
    expect(openRouter).toBeDefined();

    const modelIds = new Set(openRouter!.models.map((m) => m.id));
    expect(modelIds.has("qwen/qwen3.6-plus-preview:free")).toBe(true);
    expect(modelIds.has("nvidia/nemotron-3-super-120b-a12b:free")).toBe(true);
    expect(modelIds.has("minimax/minimax-m2.5:free")).toBe(true);
    expect(modelIds.has("qwen/qwen3-coder:free")).toBe(true);
    expect(modelIds.has("z-ai/glm-4.5-air:free")).toBe(true);
    expect(modelIds.has("anthropic/claude-sonnet-4.6")).toBe(true);
  });
});

describe("getBuiltinProviders", () => {
  it("limits OpenRouter to starter models without a BYOK key", () => {
    const openRouter = getBuiltinProviders({
      includeOpenRouterByokModels: false,
    }).find((provider) => provider.id === OPENROUTER_PROVIDER_ID);

    expect(openRouter).toBeDefined();
    expect(openRouter!.models).toEqual(OPENROUTER_STARTER_MODELS);
    expect(openRouter!.models.map((model) => model.id)).toEqual([
      "qwen/qwen3.6-plus-preview:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "minimax/minimax-m2.5:free",
      "qwen/qwen3-coder:free",
      "z-ai/glm-4.5-air:free",
    ]);
  });

  it("includes the expanded OpenRouter catalog with a BYOK key", () => {
    const openRouter = getBuiltinProviders({
      includeOpenRouterByokModels: true,
    }).find((provider) => provider.id === OPENROUTER_PROVIDER_ID);

    expect(openRouter).toBeDefined();
    expect(openRouter!.models).toEqual([
      ...OPENROUTER_STARTER_MODELS,
      ...OPENROUTER_BYOK_MODELS,
    ]);
  });
});

describe("ALL_MODELS", () => {
  it("contains all models from all providers", () => {
    const expected = PROVIDERS.reduce((sum, p) => sum + p.models.length, 0);
    expect(ALL_MODELS.length).toBe(expected);
  });

  it("has no duplicate model IDs within the same provider", () => {
    for (const p of PROVIDERS) {
      const ids = p.models.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("DEFAULT_MODEL", () => {
  it("parses to a valid provider and model", () => {
    const { providerId, modelId } = parseModelString(DEFAULT_MODEL);
    const provider = findProvider(providerId);
    expect(provider).toBeDefined();
    const model = provider!.models.find((m) => m.id === modelId);
    expect(model).toBeDefined();
  });

  it("defaults new sessions to OpenRouter starter access", () => {
    expect(DEFAULT_MODEL).toBe(`openrouter:${OPENROUTER_DEFAULT_STARTER_MODEL_ID}`);
  });
});
