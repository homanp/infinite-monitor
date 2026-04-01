import {
  OPENROUTER_PROVIDER_ID,
  OPENROUTER_STARTER_MODELS,
  parseModelString,
} from "@/lib/model-registry";

const DEFAULT_STARTER_RATE_LIMIT = 30;
const DEFAULT_STARTER_WINDOW_MS = 60_000;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const starterRateLimitState = new Map<string, RateLimitEntry>();

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class OpenRouterAccessError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "OpenRouterAccessError";
    this.status = status;
  }
}

export function hasOpenRouterStarter(): boolean {
  return !isOpenRouterStarterDisabled() && !!getSharedOpenRouterKey();
}

export function isOpenRouterModel(modelStr: string): boolean {
  return parseModelString(modelStr).providerId === OPENROUTER_PROVIDER_ID;
}

export function getOpenRouterHeaders(): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  const referer = process.env.OPENROUTER_APP_URL?.trim();
  const title = process.env.OPENROUTER_APP_NAME?.trim();

  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function resolveOpenRouterApiKey(
  modelStr: string,
  userApiKey: string | undefined,
  request: Request,
  details?: { route: "chat" | "generate-title"; widgetId?: string }
): string | undefined {
  if (!isOpenRouterModel(modelStr)) {
    return normalizeApiKey(userApiKey);
  }

  const userKey = normalizeApiKey(userApiKey);
  if (userKey) {
    return userKey;
  }

  if (isOpenRouterStarterDisabled()) {
    throw new OpenRouterAccessError(
      "OpenRouter starter access is disabled. Add your own OpenRouter API key to continue.",
      403
    );
  }

  const sharedKey = getSharedOpenRouterKey();
  if (!sharedKey) {
    throw new OpenRouterAccessError(
      "OpenRouter starter access is not configured. Set OPENROUTER_API_KEY or add your own OpenRouter API key.",
      503
    );
  }

  const { modelId } = parseModelString(modelStr);
  if (!getOpenRouterStarterModelIds().has(modelId)) {
    throw new OpenRouterAccessError(
      "This OpenRouter model requires your own OpenRouter API key. Add one to unlock the full OpenRouter catalog.",
      403
    );
  }

  const requesterKey = getRequesterKey(request);
  const rateLimit = consumeStarterRateLimit(requesterKey);
  if (!rateLimit.ok) {
    throw new OpenRouterAccessError(
      `OpenRouter starter rate limit reached. Try again in ${rateLimit.retryAfterSeconds}s or add your own OpenRouter API key.`,
      429
    );
  }

  console.info(
    `[openrouter-starter] route=${details?.route ?? "unknown"} ip=${getRequesterIp(request)} widgetId=${details?.widgetId ?? "-"} model=${modelId}`
  );

  return sharedKey;
}

export function getSharedOpenRouterKey(): string | undefined {
  return normalizeApiKey(process.env.OPENROUTER_API_KEY);
}

export function isOpenRouterStarterDisabled(): boolean {
  const raw = process.env.OPENROUTER_STARTER_DISABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function getOpenRouterStarterModelIds(): Set<string> {
  return new Set(OPENROUTER_STARTER_MODELS.map((model) => model.id));
}

function normalizeApiKey(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getRequesterIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return (
    request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || "unknown"
  );
}

function getRequesterKey(request: Request): string {
  const userAgent = request.headers.get("user-agent")?.slice(0, 80) || "unknown";
  return `${getRequesterIp(request)}:${userAgent}`;
}

function getStarterRateLimitConfig(): { limit: number; windowMs: number } {
  const limit = Number.parseInt(process.env.OPENROUTER_STARTER_RATE_LIMIT ?? "", 10);
  const windowMs = Number.parseInt(process.env.OPENROUTER_STARTER_WINDOW_MS ?? "", 10);

  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_STARTER_RATE_LIMIT,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_STARTER_WINDOW_MS,
  };
}

function consumeStarterRateLimit(requesterKey: string): { ok: boolean; retryAfterSeconds?: number } {
  const { limit, windowMs } = getStarterRateLimitConfig();
  const now = Date.now();

  for (const [key, entry] of starterRateLimitState) {
    if (entry.resetAt <= now) {
      starterRateLimitState.delete(key);
    }
  }

  const entry = starterRateLimitState.get(requesterKey);
  if (!entry || entry.resetAt <= now) {
    starterRateLimitState.set(requesterKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { ok: true };
  }

  if (entry.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;
  starterRateLimitState.set(requesterKey, entry);
  return { ok: true };
}

export function __resetOpenRouterStarterRateLimitForTests(): void {
  starterRateLimitState.clear();
}
