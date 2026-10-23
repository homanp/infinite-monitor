/**
 * OrcaRouter origins.
 *
 * Authentication (consent screen + code exchange) lives on the auth origin,
 * while inference and model discovery live on the API origin. They are
 * separate public hosts and neither may be derived from the other.
 */

export const DEFAULT_ORCA_AUTH_BASE_URL = "https://www.orcarouter.ai";
export const DEFAULT_ORCA_API_BASE_URL = "https://api.orcarouter.ai/v1";

export const ORCA_AUTH_PATH = "/auth";
export const ORCA_EXCHANGE_PATH = "/api/v1/auth/keys";
export const ORCA_MODELS_PATH = "/models";

export interface OrcaOrigins {
  authBase: string;
  apiBase: string;
}

type EnvLike = Record<string, string | undefined>;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/**
 * Validate an operator-provided origin. Remote origins must be HTTPS; HTTP is
 * only accepted for loopback development hosts.
 */
export function assertSecureOrigin(raw: string, label: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid URL: ${raw}`);
  }

  if (url.username || url.password) {
    throw new Error(`${label} must not contain credentials`);
  }
  if (url.search || url.hash) {
    throw new Error(`${label} must not contain a query string or fragment`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} must use http or https`);
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new Error(
      `${label} must use HTTPS for non-loopback hosts (HTTP is only allowed for loopback development)`
    );
  }

  return url.toString().replace(/\/+$/, "");
}

function joinVersionPath(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/**
 * Resolution order (explicit overrides win):
 *   ORCA_AUTH_BASE_URL / ORCA_API_BASE_URL
 *   ORCA_BASE_URL (shared self-hosted origin, used as a fallback for both)
 *   public OrcaRouter defaults
 */
export function resolveOrcaOrigins(env: EnvLike = process.env): OrcaOrigins {
  const shared = clean(env.ORCA_BASE_URL);
  const authRaw = clean(env.ORCA_AUTH_BASE_URL) ?? shared ?? DEFAULT_ORCA_AUTH_BASE_URL;
  const apiRaw = clean(env.ORCA_API_BASE_URL) ?? (shared ? joinVersionPath(shared) : DEFAULT_ORCA_API_BASE_URL);

  return {
    authBase: assertSecureOrigin(authRaw, "ORCA_AUTH_BASE_URL"),
    apiBase: assertSecureOrigin(apiRaw, "ORCA_API_BASE_URL"),
  };
}

export function buildAuthorizeBaseUrl(authBase: string): string {
  return `${authBase.replace(/\/+$/, "")}${ORCA_AUTH_PATH}`;
}

export function buildExchangeUrl(authBase: string): string {
  return `${authBase.replace(/\/+$/, "")}${ORCA_EXCHANGE_PATH}`;
}

export function buildModelsUrl(apiBase: string, capability: string): string {
  const url = new URL(`${apiBase.replace(/\/+$/, "")}${ORCA_MODELS_PATH}`);
  url.searchParams.set("capability", capability);
  return url.toString();
}
