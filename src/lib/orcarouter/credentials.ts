/**
 * OrcaRouter credential seam.
 *
 * Two adapters produce the same credential result: a pasted API key and the
 * OAuth 2.0 + PKCE connect flow. Everything downstream (provider requests,
 * model discovery) consumes only `OrcaCredential.key` and must not care which
 * adapter produced it.
 */

export type OrcaCredentialSource = "api-key" | "pkce";

export interface OrcaCredential {
  key: string;
  source: OrcaCredentialSource;
  /** Granted scope when the key came from PKCE, otherwise null. */
  scope: string | null;
  userId: string | null;
  obtainedAt: number;
}

export interface CredentialAdapter {
  readonly id: OrcaCredentialSource;
  acquire(): Promise<OrcaCredential>;
}

export class OrcaRouterAccessError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 403, code = "orcarouter_access_required") {
    super(message);
    this.name = "OrcaRouterAccessError";
    this.status = status;
    this.code = code;
  }
}

export function normalizeOrcaKey(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * API-key adapter: the key the user pasted into the project's existing
 * BYOK field. Only an obvious format mistake is flagged; an `sk-orca-` prefix
 * is not proof that a credential is valid, so validity is established by the
 * first real request.
 */
export function createApiKeyAdapter(rawKey: string | undefined, now: () => number = Date.now): CredentialAdapter {
  return {
    id: "api-key",
    async acquire(): Promise<OrcaCredential> {
      const key = normalizeOrcaKey(rawKey);
      if (!key) {
        throw new OrcaRouterAccessError(
          "Enter an OrcaRouter API key (sk-orca-…) or connect your OrcaRouter account.",
          401,
          "orcarouter_api_key_missing"
        );
      }
      if (/\s/.test(key)) {
        throw new OrcaRouterAccessError(
          "That OrcaRouter API key contains whitespace. Copy it again without spaces.",
          400,
          "orcarouter_api_key_malformed"
        );
      }
      return { key, source: "api-key", scope: null, userId: null, obtainedAt: now() };
    },
  };
}

/**
 * PKCE adapter: wraps the connect flow. The flow is injected so the browser
 * implementation and the tests share one seam.
 */
export function createPkceAdapter(
  connect: () => Promise<{ key: string; scope: string | null; userId: string | null }>,
  now: () => number = Date.now
): CredentialAdapter {
  return {
    id: "pkce",
    async acquire(): Promise<OrcaCredential> {
      const result = await connect();
      const key = normalizeOrcaKey(result.key);
      if (!key) {
        throw new OrcaRouterAccessError(
          "OrcaRouter did not return an API key. Start the connection again.",
          502,
          "orcarouter_pkce_empty_key"
        );
      }
      return {
        key,
        source: "pkce",
        scope: result.scope ?? null,
        userId: result.userId ?? null,
        obtainedAt: now(),
      };
    },
  };
}

export interface StoredOrcaAuth {
  key?: string;
  source?: OrcaCredentialSource | null;
  scope?: string | null;
  userId?: string | null;
  generation?: number;
  needsReauth?: boolean;
}

export function credentialFromStoredAuth(stored: StoredOrcaAuth | null | undefined): OrcaCredential | null {
  const key = normalizeOrcaKey(stored?.key);
  if (!key) return null;
  return {
    key,
    source: stored?.source === "pkce" ? "pkce" : "api-key",
    scope: stored?.scope ?? null,
    userId: stored?.userId ?? null,
    obtainedAt: 0,
  };
}

/**
 * Resolve the key used for an inference request. OrcaRouter is BYOK: there is
 * no shared starter key and no fallback to another provider's credential.
 */
export function resolveOrcaRouterApiKey(modelStr: string, userApiKey: string | undefined): string | undefined {
  if (!isOrcaRouterModelString(modelStr)) {
    return normalizeOrcaKey(userApiKey);
  }
  const key = normalizeOrcaKey(userApiKey);
  if (!key) {
    throw new OrcaRouterAccessError(
      "OrcaRouter requires your own API key or a connected OrcaRouter account. Add one in the model menu.",
      401,
      "orcarouter_access_required"
    );
  }
  return key;
}

export function isOrcaRouterModelString(modelStr: string): boolean {
  return modelStr.startsWith("orcarouter:");
}

/** Never render a full credential: keep a short recognizable tail only. */
export function maskSecret(key: string | undefined | null): string {
  const value = key?.trim();
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 5)}${"•".repeat(Math.max(4, Math.min(12, value.length - 8)))}${value.slice(-4)}`;
}
