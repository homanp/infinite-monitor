import { describe, it, expect, vi } from "vitest";
import {
  fetchOrcaCatalog,
  filterModels,
  ORCAROUTER_SEED_MODELS,
  parseModelRecord,
  parseModelsResponse,
  toPublicModels,
  type OrcaModel,
} from "@/lib/orcarouter/catalog";
import { buildOrcaModelOptions, isCompatibleSelection } from "@/lib/orcarouter/selector";

const FIXTURE = {
  data: [
    {
      id: "openai/gpt-5.5",
      name: "GPT-5.5",
      context_length: 400000,
      architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
      supported_endpoint_types: ["openai", "openai-response"],
      capability: "chat",
      reasoning: { efforts: ["low", "medium", "high", "xhigh"] },
    },
    {
      id: "deepseek/deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      architecture: { input_modalities: ["text"] },
      supported_endpoint_types: ["openai"],
      capability: "chat",
    },
    {
      id: "text/plain-chat-no-modalities",
      name: "Plain Chat",
      supported_endpoint_types: ["anthropic"],
      capability: "chat",
    },
    {
      id: "openai/text-embedding-4",
      name: "Text Embedding 4",
      supported_endpoint_types: ["embeddings"],
      capability: "embedding",
    },
    {
      id: "google/imagen-5",
      name: "Imagen 5",
      supported_endpoint_types: ["image-generation"],
      capability: "image",
    },
    {
      id: "openai/sora-3",
      name: "Sora 3",
      supported_endpoint_types: ["openai-video"],
      capability: "video",
    },
    {
      id: "jina/jina-reranker-v3",
      name: "Jina Reranker v3",
      supported_endpoint_types: ["jina-rerank"],
      capability: "rerank",
    },
  ],
};

describe("parseModelsResponse", () => {
  it("preserves vendor/model namespaces and metadata", () => {
    const models = parseModelsResponse(FIXTURE);
    const gpt = models.find((model) => model.id === "openai/gpt-5.5");
    expect(gpt).toBeDefined();
    expect(gpt!.contextLength).toBe(400000);
    expect(gpt!.inputModalities).toEqual(["text", "image"]);
    expect(gpt!.supportedEndpointTypes).toEqual(["openai", "openai-response"]);
    expect(gpt!.reasoning?.efforts).toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("skips malformed records and duplicates", () => {
    const models = parseModelsResponse({ data: [{ name: "no id" }, { id: "a/b" }, { id: "a/b" }, null] });
    expect(models.map((model) => model.id)).toEqual(["a/b"]);
  });

  it("bounds the item count", () => {
    const many = { data: Array.from({ length: 50 }, (_, i) => ({ id: `vendor/m${i}` })) };
    expect(parseModelsResponse(many, 10)).toHaveLength(10);
  });

  it("returns null for a record without an id", () => {
    expect(parseModelRecord({ name: "x" })).toBeNull();
  });
});

describe("capability filtering", () => {
  const models = parseModelsResponse(FIXTURE);

  it("keeps only text-capable chat models for the chat entry point", () => {
    const chat = filterModels(models, { capability: "chat" });
    expect(chat.map((model) => model.id)).toEqual([
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
      "text/plain-chat-no-modalities",
    ]);
  });

  it("fails closed for multimodal chat when input modalities are not declared", () => {
    const multimodal = filterModels(models, {
      capability: "chat",
      inputModalities: ["text", "image"],
    });
    expect(multimodal.map((model) => model.id)).toEqual(["openai/gpt-5.5"]);
  });

  it("filters embeddings, image generation, video and rerank separately", () => {
    expect(filterModels(models, { capability: "embedding" }).map((m) => m.id))
      .toEqual(["openai/text-embedding-4"]);
    expect(filterModels(models, { capability: "image" }).map((m) => m.id))
      .toEqual(["google/imagen-5"]);
    expect(filterModels(models, { capability: "video" }).map((m) => m.id))
      .toEqual(["openai/sora-3"]);
    expect(filterModels(models, { capability: "rerank" }).map((m) => m.id))
      .toEqual(["jina/jina-reranker-v3"]);
  });

  it("never guesses capability from a model name", () => {
    const guessed: OrcaModel = {
      id: "vendor/something-vision",
      name: "Something Vision",
      contextLength: null,
      inputModalities: [],
      outputModalities: [],
      supportedEndpointTypes: ["image-generation"],
      capability: null,
      reasoning: null,
    };
    expect(filterModels([guessed], { capability: "chat" })).toHaveLength(0);
  });
});

describe("selector options", () => {
  const catalog = toPublicModels(parseModelsResponse(FIXTURE));

  it("offers every chat model for a text-only message", () => {
    const options = buildOrcaModelOptions({ catalog, requiresImageInput: false });
    expect(options.map((model) => model.id)).toContain("deepseek/deepseek-v4-pro");
  });

  it("offers only explicit image-input chat models once an image is attached", () => {
    const options = buildOrcaModelOptions({ catalog, requiresImageInput: true });
    expect(options.map((model) => model.id)).toEqual(["openai/gpt-5.5"]);
  });

  it("invalidates a selected text-only model after an image is attached", () => {
    const options = buildOrcaModelOptions({ catalog, requiresImageInput: true });
    expect(isCompatibleSelection("deepseek/deepseek-v4-pro", options)).toBe(false);
    expect(isCompatibleSelection("openai/gpt-5.5", options)).toBe(true);
  });
});

describe("verified fallback seed", () => {
  it("keeps the verified models and their metadata", () => {
    const ids = ORCAROUTER_SEED_MODELS.map((model) => model.id);
    expect(ids).toEqual([
      "openai/gpt-5.5",
      "anthropic/claude-opus-4.8",
      "google/gemini-3.5-flash",
      "deepseek/deepseek-v4-pro",
      "orcarouter/auto",
    ]);
    const gpt = ORCAROUTER_SEED_MODELS.find((model) => model.id === "openai/gpt-5.5")!;
    expect(gpt.reasoning?.efforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(gpt.inputModalities).toContain("image");
  });
});

describe("fetchOrcaCatalog", () => {
  it("calls the configured API origin with the user's bearer key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200 }));
    const models = await fetchOrcaCatalog({
      apiBase: "https://api.orcarouter.ai/v1",
      apiKey: "sk-orca-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.orcarouter.ai/v1/models?capability=chat");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-orca-test");
    expect(models.map((model) => model.id)).toContain("openai/gpt-5.5");
  });

  it("reports an auth failure without retrying", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 }));
    await expect(fetchOrcaCatalog({
      apiBase: "https://api.orcarouter.ai/v1",
      apiKey: "sk-orca-revoked",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized bodies", async () => {
    const huge = "x".repeat(600 * 1024);
    const fetchImpl = vi.fn(async () => new Response(huge, { status: 200 }));
    await expect(fetchOrcaCatalog({
      apiBase: "https://api.orcarouter.ai/v1",
      apiKey: "sk-orca-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ status: 502 });
  });

  it("rejects unreadable payloads", async () => {
    const fetchImpl = vi.fn(async () => new Response("not json", { status: 200 }));
    await expect(fetchOrcaCatalog({
      apiBase: "https://api.orcarouter.ai/v1",
      apiKey: "sk-orca-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ status: 502 });
  });
});
