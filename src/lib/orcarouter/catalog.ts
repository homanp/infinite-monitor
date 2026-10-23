/**
 * OrcaRouter model discovery.
 *
 * The authoritative catalog is `GET {apiBase}/models` on the configured API
 * origin. Live results are filtered per AI entry point (text chat, multimodal
 * chat, embedding, image, video, rerank) and never mixed with the seed once
 * discovery succeeds. The seed is only a small, verified cold-start /
 * outage fallback and is always labelled as degraded in the UI.
 */

import { buildModelsUrl } from "@/lib/orcarouter/config";

export type OrcaCapability = "chat" | "embedding" | "image" | "video" | "rerank";

export interface OrcaModelReasoning {
  efforts: string[];
  default?: string;
}

export interface OrcaModel {
  id: string;
  name: string;
  contextLength: number | null;
  inputModalities: string[];
  outputModalities: string[];
  supportedEndpointTypes: string[];
  capability: OrcaCapability | null;
  reasoning: OrcaModelReasoning | null;
}

export const TEXT_ENDPOINT_TYPES = ["openai", "anthropic", "gemini", "openai-response"] as const;
const NON_TEXT_ENDPOINT_TYPES = ["image-generation", "openai-video", "jina-rerank", "embeddings"] as const;

const MAX_ITEMS = 300;
const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;

export class OrcaCatalogError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "OrcaCatalogError";
    this.status = status;
  }
}

/**
 * Verified cold-start seed. Only hand-maintained because a fresh install must
 * not appear to support zero models while discovery is unreachable. Metadata
 * here is deliberately conservative: anything not verified upstream is not
 * claimed.
 */
export const ORCAROUTER_SEED_MODELS: OrcaModel[] = [
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    contextLength: 400_000,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    supportedEndpointTypes: ["openai", "openai-response"],
    capability: "chat",
    reasoning: { efforts: ["low", "medium", "high", "xhigh"] },
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    contextLength: 200_000,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    supportedEndpointTypes: ["anthropic"],
    capability: "chat",
    reasoning: null,
  },
  {
    id: "google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    contextLength: 1_000_000,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    supportedEndpointTypes: ["gemini"],
    capability: "chat",
    reasoning: null,
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    contextLength: 128_000,
    inputModalities: ["text"],
    outputModalities: ["text"],
    supportedEndpointTypes: ["openai"],
    capability: "chat",
    reasoning: null,
  },
  {
    id: "orcarouter/auto",
    name: "OrcaRouter Auto",
    contextLength: null,
    inputModalities: ["text"],
    outputModalities: ["text"],
    supportedEndpointTypes: ["openai"],
    capability: "chat",
    reasoning: null,
  },
];

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((item): item is string => item !== null).map((item) => item.toLowerCase());
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function normalizeCapability(value: unknown): OrcaCapability | null {
  const raw = asString(value)?.toLowerCase();
  switch (raw) {
    case "chat":
    case "completion":
    case "text":
      return "chat";
    case "embedding":
    case "embeddings":
      return "embedding";
    case "image":
    case "image-generation":
      return "image";
    case "video":
      return "video";
    case "rerank":
      return "rerank";
    default:
      return null;
  }
}

/** Parse one catalog record, rejecting anything that cannot be a model. */
export function parseModelRecord(record: unknown): OrcaModel | null {
  if (!record || typeof record !== "object") return null;
  const raw = record as Record<string, unknown>;
  const id = asString(raw.id);
  if (!id) return null;

  const architecture = (raw.architecture ?? {}) as Record<string, unknown>;
  const inputModalities = asStringArray(
    architecture.input_modalities ?? raw.input_modalities ?? raw.inputModalities
  );
  const outputModalities = asStringArray(
    architecture.output_modalities ?? raw.output_modalities ?? raw.outputModalities
  );
  const supportedEndpointTypes = asStringArray(
    raw.supported_endpoint_types ?? raw.supportedEndpointTypes ?? raw.endpoint_types
  );

  const reasoningRaw = (raw.reasoning ?? raw.supported_reasoning) as Record<string, unknown> | undefined;
  const efforts = asStringArray(reasoningRaw?.efforts ?? raw.reasoning_efforts);
  const reasoning: OrcaModelReasoning | null = efforts.length > 0
    ? {
        efforts,
        default: asString(reasoningRaw?.default) ?? undefined,
      }
    : null;

  return {
    id,
    name: asString(raw.name) ?? id,
    contextLength: asNumber(raw.context_length ?? raw.contextLength ?? raw.context_window),
    inputModalities,
    outputModalities,
    supportedEndpointTypes,
    capability: normalizeCapability(raw.capability ?? raw.type),
    reasoning,
  };
}

/** Parse a `/models` payload, bounded by item count. */
export function parseModelsResponse(payload: unknown, maxItems = MAX_ITEMS): OrcaModel[] {
  const list: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data)
      : [];

  const models: OrcaModel[] = [];
  const seen = new Set<string>();
  for (const record of list) {
    if (models.length >= Math.min(maxItems, MAX_ITEMS)) break;
    const model = parseModelRecord(record);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }
  return models;
}

export interface ModelFilterRequest {
  capability: OrcaCapability;
  /** Non-text modalities the entry point is actually about to upload. */
  inputModalities?: string[];
}

function declaredModalities(model: OrcaModel): string[] {
  return model.inputModalities.length > 0 ? model.inputModalities : [];
}

function speaksText(model: OrcaModel): boolean {
  const endpoints = model.supportedEndpointTypes;
  if (endpoints.length > 0) {
    return endpoints.some((type) => (TEXT_ENDPOINT_TYPES as readonly string[]).includes(type));
  }
  return model.capability === "chat";
}

/**
 * Capability filter. Unproven capability fails closed: a model is only offered
 * when the catalog metadata says the entry point can actually speak to it.
 */
export function filterModels(models: OrcaModel[], request: ModelFilterRequest): OrcaModel[] {
  const requiredModalities = (request.inputModalities ?? [])
    .map((value) => value.toLowerCase())
    .filter((value) => value !== "text");

  return models.filter((model) => {
    const endpoints = model.supportedEndpointTypes;

    if (request.capability === "chat") {
      if (!speaksText(model)) return false;
      // Text-only chat must not offer a model whose only route is a
      // non-text capability endpoint.
      if (endpoints.length > 0 && !endpoints.some((type) => (TEXT_ENDPOINT_TYPES as readonly string[]).includes(type))) {
        return false;
      }
      if (endpoints.some((type) => type === "jina-rerank" || type === "openai-video" || type === "image-generation")
        && !endpoints.some((type) => (TEXT_ENDPOINT_TYPES as readonly string[]).includes(type))) {
        return false;
      }
      for (const modality of requiredModalities) {
        if (!declaredModalities(model).includes(modality)) return false;
      }
      return true;
    }

    if (request.capability === "embedding") {
      return model.capability === "embedding" || endpoints.includes("embeddings");
    }
    if (request.capability === "image") {
      return model.capability === "image" || endpoints.includes("image-generation");
    }
    if (request.capability === "video") {
      return endpoints.includes("openai-video");
    }
    if (request.capability === "rerank") {
      return endpoints.includes("jina-rerank");
    }
    return false;
  });
}

/** Text-only chat models that would be filtered out of a multimodal list. */
export function isCompatible(model: OrcaModel, request: ModelFilterRequest): boolean {
  return filterModels([model], request).length === 1;
}

function isChatShaped(model: OrcaModel): boolean {
  return filterModels([model], { capability: "chat" }).length === 1;
}

/** Drop capability records that can be described but not used for chat. */
export function chatCatalog(models: OrcaModel[]): OrcaModel[] {
  return models.filter(isChatShaped);
}

export function hasNonTextEndpoint(model: OrcaModel): boolean {
  return model.supportedEndpointTypes.some((type) => (NON_TEXT_ENDPOINT_TYPES as readonly string[]).includes(type));
}

export interface CatalogFetchParams {
  apiBase: string;
  apiKey: string;
  capability?: OrcaCapability;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxItems?: number;
}

/**
 * Fetch the live catalog. Caller-side limits: bounded timeout, bounded body
 * size, bounded item count, bounded accepted shape.
 */
export async function fetchOrcaCatalog({
  apiBase,
  apiKey,
  capability = "chat",
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxItems = MAX_ITEMS,
}: CatalogFetchParams): Promise<OrcaModel[]> {
  const doFetch = fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await doFetch(buildModelsUrl(apiBase, capability), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new OrcaCatalogError("OrcaRouter model catalog timed out.", 504);
    }
    throw new OrcaCatalogError("Could not reach the OrcaRouter model catalog.", 502);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new OrcaCatalogError("OrcaRouter rejected the credential while listing models.", 401);
  }
  if (!response.ok) {
    throw new OrcaCatalogError(`OrcaRouter model catalog failed (HTTP ${response.status}).`, 502);
  }

  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new OrcaCatalogError("OrcaRouter model catalog response was too large.", 502);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new OrcaCatalogError("OrcaRouter model catalog returned unreadable JSON.", 502);
  }

  return filterModels(parseModelsResponse(payload, maxItems), { capability });
}

/** Minimal metadata the browser needs; the key never leaves the server. */
export interface PublicOrcaModel {
  id: string;
  name: string;
  contextLength: number | null;
  inputModalities: string[];
  reasoningEfforts: string[];
}

export function toPublicModels(models: OrcaModel[]): PublicOrcaModel[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    contextLength: model.contextLength,
    inputModalities: model.inputModalities,
    reasoningEfforts: model.reasoning?.efforts ?? [],
  }));
}
