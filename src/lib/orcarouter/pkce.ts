/**
 * OAuth 2.0 + PKCE primitives for the OrcaRouter connect flow.
 *
 * The flow is Flow A (redirect back to this application): the app has a
 * browser and can receive an HTTPS (or loopback HTTP) redirect, so the code
 * returns automatically and the user never copies it. S256 is used
 * unconditionally — a user may still choose "show me a code" on the consent
 * screen, and a displayed code must never be redeemable with a `plain`
 * challenge that travelled in the authorize URL.
 */

export type OrcaPkceErrorCode =
  | "denied"
  | "state_mismatch"
  | "invalid_request"
  | "code_rejected"
  | "rate_limited"
  | "insufficient_scope"
  | "network"
  | "timeout"
  | "invalid_response";

export class OrcaPkceError extends Error {
  readonly code: OrcaPkceErrorCode;

  constructor(code: OrcaPkceErrorCode, message: string) {
    super(message);
    this.name = "OrcaPkceError";
    this.code = code;
  }
}

export interface PkceAttempt {
  verifier: string;
  challenge: string;
  state: string;
}

export interface ExchangedKey {
  key: string;
  userId: string | null;
  scope: string | null;
}

type CryptoLike = Pick<Crypto, "getRandomValues" | "subtle">;

function getCrypto(cryptoImpl?: CryptoLike): CryptoLike {
  const resolved = cryptoImpl ?? (globalThis.crypto as CryptoLike | undefined);
  if (!resolved?.getRandomValues || !resolved.subtle) {
    throw new OrcaPkceError("invalid_request", "A Web Crypto implementation is required for PKCE");
  }
  return resolved;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Fresh verifier, challenge and state for every authorization attempt. */
export async function createPkceAttempt(cryptoImpl?: CryptoLike): Promise<PkceAttempt> {
  const webCrypto = getCrypto(cryptoImpl);
  const verifierBytes = new Uint8Array(32);
  webCrypto.getRandomValues(verifierBytes);
  const stateBytes = new Uint8Array(16);
  webCrypto.getRandomValues(stateBytes);

  const verifier = base64UrlEncode(verifierBytes);
  const digest = await webCrypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));

  return {
    verifier,
    challenge: base64UrlEncode(new Uint8Array(digest)),
    state: base64UrlEncode(stateBytes),
  };
}

export interface AuthorizeUrlParams {
  authBase: string;
  callbackUrl: string;
  attempt: PkceAttempt;
  appName: string;
  scope?: "api" | "connector";
}

export function buildAuthorizeUrl({
  authBase,
  callbackUrl,
  attempt,
  appName,
  scope = "api",
}: AuthorizeUrlParams): string {
  const url = new URL(`${authBase.replace(/\/+$/, "")}/auth`);
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("code_challenge", attempt.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", attempt.state);
  url.searchParams.set("app_name", appName);
  url.searchParams.set("scope", scope);
  return url.toString();
}

/** Compare two opaque strings without leaking a prefix match through timing. */
export function constantTimeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export interface ExchangeParams {
  authBase: string;
  code: string;
  verifier: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

const DEFAULT_EXCHANGE_TIMEOUT_MS = 20_000;

/**
 * Exchange a one-time code for a durable OrcaRouter API key. The auth origin
 * is passed explicitly by the caller; this function never derives it from the
 * inference origin.
 */
export async function exchangeAuthorizationCode({
  authBase,
  code,
  verifier,
  fetchImpl,
  timeoutMs = DEFAULT_EXCHANGE_TIMEOUT_MS,
}: ExchangeParams): Promise<ExchangedKey> {
  const doFetch = fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await doFetch(`${authBase.replace(/\/+$/, "")}/api/v1/auth/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        code_challenge_method: "S256",
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new OrcaPkceError("timeout", "OrcaRouter authorization timed out. Start the connection again.");
    }
    throw new OrcaPkceError("network", "Could not reach OrcaRouter. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 400) {
    throw new OrcaPkceError(
      "invalid_request",
      "OrcaRouter rejected the authorization request. Start the connection again."
    );
  }
  if (response.status === 403) {
    throw new OrcaPkceError(
      "code_rejected",
      "That authorization code is unknown, expired or already used. Start the connection again."
    );
  }
  if (response.status === 429) {
    throw new OrcaPkceError(
      "rate_limited",
      "OrcaRouter is rate limiting new authorizations. Wait a moment or use an API key."
    );
  }
  if (!response.ok) {
    throw new OrcaPkceError("network", `OrcaRouter authorization failed (HTTP ${response.status}).`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OrcaPkceError("invalid_response", "OrcaRouter returned an unreadable authorization response.");
  }

  const data = payload as { key?: unknown; user_id?: unknown; scope?: unknown };
  if (typeof data?.key !== "string" || data.key.length === 0) {
    throw new OrcaPkceError("invalid_response", "OrcaRouter did not return an API key.");
  }

  const grantedScope = typeof data.scope === "string" ? data.scope : null;
  if (!grantedScope || !scopeAllowsApi(grantedScope)) {
    throw new OrcaPkceError(
      "insufficient_scope",
      "OrcaRouter granted a scope that this app cannot use. Use an API key instead."
    );
  }

  return {
    key: data.key,
    userId: typeof data.user_id === "string" ? data.user_id : null,
    scope: grantedScope,
  };
}

/** `scope` is what was granted, not what was requested. */
export function scopeAllowsApi(scope: string): boolean {
  return scope
    .split(/\s+/)
    .map((value) => value.trim().toLowerCase())
    .some((value) => value === "api");
}

export interface CallbackResult {
  code: string | null;
  error: string | null;
}

export function parseCallbackParams(search: string, expectedState: string | null): CallbackResult {
  const params = new URLSearchParams(search);
  const state = params.get("state");
  if (!constantTimeEqual(state, expectedState)) {
    throw new OrcaPkceError("state_mismatch", "The authorization response did not match this login attempt.");
  }
  const error = params.get("error");
  if (error) {
    if (error === "access_denied") {
      throw new OrcaPkceError("denied", "OrcaRouter authorization was declined.");
    }
    throw new OrcaPkceError("invalid_request", `OrcaRouter authorization failed: ${error}.`);
  }
  const code = params.get("code");
  if (!code) {
    throw new OrcaPkceError("invalid_response", "OrcaRouter did not return an authorization code.");
  }
  return { code, error: null };
}
