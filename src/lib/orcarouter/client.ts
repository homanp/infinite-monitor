/**
 * Browser-side helpers for the OrcaRouter provider. They only ever talk to
 * this application's own API routes; the inference key never goes into a URL.
 */

import { DEFAULT_ORCA_AUTH_BASE_URL } from "@/lib/orcarouter/config";
import {
  OrcaPkceError,
  type ExchangedKey,
  type OrcaPkceErrorCode,
} from "@/lib/orcarouter/pkce";
import type { OrcaLoginStorage } from "@/lib/orcarouter/login-controller";
import type { PublicOrcaModel } from "@/lib/orcarouter/catalog";

export interface OrcaClientConfig {
  authBase: string;
  apiBase: string;
}

export async function fetchOrcaClientConfig(fetchImpl: typeof fetch = fetch): Promise<OrcaClientConfig> {
  try {
    const response = await fetchImpl("/api/orcarouter/config", { cache: "no-store" });
    if (!response.ok) throw new Error("config unavailable");
    const data = (await response.json()) as Partial<OrcaClientConfig>;
    return {
      authBase: typeof data.authBase === "string" ? data.authBase : DEFAULT_ORCA_AUTH_BASE_URL,
      apiBase: typeof data.apiBase === "string" ? data.apiBase : "",
    };
  } catch {
    return { authBase: DEFAULT_ORCA_AUTH_BASE_URL, apiBase: "" };
  }
}

export class OrcaCatalogRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OrcaCatalogRequestError";
    this.status = status;
  }
}

/**
 * Live model discovery through the server route, which holds the catalog
 * request. Only minimal metadata comes back to the browser.
 */
export async function fetchOrcaModelsFromRoute(
  apiKey: string,
  capability: "chat" | "embedding" | "image" | "video" | "rerank" = "chat",
  fetchImpl: typeof fetch = fetch
): Promise<PublicOrcaModel[]> {
  const response = await fetchImpl(`/api/orcarouter/models?capability=${capability}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new OrcaCatalogRequestError(
      response.status === 401
        ? "OrcaRouter rejected this credential while listing models."
        : "OrcaRouter model discovery is unavailable.",
      response.status
    );
  }

  const payload = (await response.json()) as { models?: PublicOrcaModel[] };
  return Array.isArray(payload.models) ? payload.models : [];
}

const EXCHANGE_ERROR_CODES: readonly OrcaPkceErrorCode[] = [
  "denied",
  "state_mismatch",
  "invalid_request",
  "code_rejected",
  "rate_limited",
  "insufficient_scope",
  "network",
  "timeout",
  "invalid_response",
];

function asExchangeErrorCode(value: unknown): OrcaPkceErrorCode {
  return typeof value === "string" && (EXCHANGE_ERROR_CODES as readonly string[]).includes(value)
    ? (value as OrcaPkceErrorCode)
    : "network";
}

export async function exchangeCodeViaRoute(
  params: { code: string; verifier: string },
  fetchImpl: typeof fetch = fetch
): Promise<ExchangedKey> {
  const response = await fetchImpl("/api/orcarouter/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: params.code, codeVerifier: params.verifier }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    key?: string;
    scope?: string | null;
    userId?: string | null;
    error?: string;
    message?: string;
  };

  if (!response.ok || typeof payload.key !== "string") {
    // Preserve the exchange error code so the panel can tell a rejected code
    // apart from a transient network failure.
    throw new OrcaPkceError(
      asExchangeErrorCode(payload.error),
      payload.message ?? "Could not complete the OrcaRouter authorization."
    );
  }

  return { key: payload.key, scope: payload.scope ?? null, userId: payload.userId ?? null };
}

export function createSessionStorageAdapter(): OrcaLoginStorage {
  return {
    getItem: (key) => {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        // Storage can be unavailable in private modes; the flow still works
        // for the current page.
      }
    },
    removeItem: (key) => {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}
