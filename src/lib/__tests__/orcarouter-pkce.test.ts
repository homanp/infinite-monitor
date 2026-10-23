import { describe, it, expect, vi } from "vitest";
import {
  base64UrlEncode,
  buildAuthorizeUrl,
  constantTimeEqual,
  createPkceAttempt,
  exchangeAuthorizationCode,
  OrcaPkceError,
  parseCallbackParams,
} from "@/lib/orcarouter/pkce";
import { buildAuthorizeBaseUrl, buildExchangeUrl } from "@/lib/orcarouter/config";

const AUTH_BASE = "https://www.orcarouter.ai";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PKCE verifier and challenge", () => {
  it("produces an unpadded base64url verifier and an S256 challenge", async () => {
    const attempt = await createPkceAttempt();
    expect(attempt.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.verifier).not.toContain("=");
    expect(attempt.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.challenge).not.toBe(attempt.verifier);

    const expected = base64UrlEncode(
      new Uint8Array(await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(attempt.verifier)
      ))
    );
    expect(attempt.challenge).toBe(expected);
  });

  it("uses a fresh verifier and state for every attempt", async () => {
    const first = await createPkceAttempt();
    const second = await createPkceAttempt();
    expect(first.verifier).not.toBe(second.verifier);
    expect(first.state).not.toBe(second.state);
  });
});

describe("authorize URL", () => {
  it("targets the auth origin and never leaks the verifier", async () => {
    const attempt = await createPkceAttempt();
    const url = new URL(buildAuthorizeUrl({
      authBase: AUTH_BASE,
      callbackUrl: "http://localhost:3000/orca-callback",
      attempt,
      appName: "Infinite Monitor",
    }));

    expect(url.origin).toBe("https://www.orcarouter.ai");
    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("callback_url")).toBe("http://localhost:3000/orca-callback");
    expect(url.searchParams.get("code_challenge")).toBe(attempt.challenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(attempt.state);
    expect(url.searchParams.get("app_name")).toBe("Infinite Monitor");
    expect(url.searchParams.get("scope")).toBe("api");
    expect(url.toString()).not.toContain(attempt.verifier);
  });

  it("keeps auth and inference origins separate", () => {
    expect(buildAuthorizeBaseUrl(AUTH_BASE)).toBe("https://www.orcarouter.ai/auth");
    expect(buildExchangeUrl(AUTH_BASE)).toBe("https://www.orcarouter.ai/api/v1/auth/keys");
    expect(buildExchangeUrl(AUTH_BASE)).not.toContain("api.orcarouter.ai");
    // The common mistake: auth endpoints do not live under the relay's /v1.
    expect(buildExchangeUrl(AUTH_BASE)).not.toBe("https://api.orcarouter.ai/v1/auth/keys");
  });
});

describe("constantTimeEqual", () => {
  it("compares equal and unequal opaque strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual(null, "abc")).toBe(false);
  });
});

describe("exchangeAuthorizationCode", () => {
  it("posts code and verifier to the auth origin only", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ key: "sk-orca-test-key", user_id: "42", scope: "api" }));
    const result = await exchangeAuthorizationCode({
      authBase: AUTH_BASE,
      code: "one-time-code",
      verifier: "verifier-value",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ key: "sk-orca-test-key", userId: "42", scope: "api" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.orcarouter.ai/api/v1/auth/keys");
    expect(url).not.toContain("api.orcarouter.ai");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      code: "one-time-code",
      code_verifier: "verifier-value",
      code_challenge_method: "S256",
    });
  });

  it("rejects a 400 from a downgraded challenge method", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "invalid_request" }, 400));
    await expect(exchangeAuthorizationCode({
      authBase: AUTH_BASE,
      code: "c",
      verifier: "v",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("treats an unknown, expired or reused code (403) as terminal", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "invalid_grant" }, 403));
    const error = await exchangeAuthorizationCode({
      authBase: AUTH_BASE,
      code: "used-code",
      verifier: "v",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((err) => err);

    expect(error).toBeInstanceOf(OrcaPkceError);
    expect(error.code).toBe("code_rejected");
    // The rejected code must not be echoed back.
    expect(error.message).not.toContain("used-code");
  });

  it("maps 429 to a rate limit error instead of retrying", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "rate_limited" }, 429));
    await expect(exchangeAuthorizationCode({
      authBase: AUTH_BASE,
      code: "c",
      verifier: "v",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("surfaces transport failures without leaking the verifier", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const error = await exchangeAuthorizationCode({
      authBase: AUTH_BASE,
      code: "c",
      verifier: "super-secret-verifier",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((err) => err);

    expect(error.code).toBe("network");
    expect(error.message).not.toContain("super-secret-verifier");
  });

  it("does not accept a granted scope it cannot use", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ key: "sk-orca-x", user_id: "1", scope: "connector" }));
    await expect(exchangeAuthorizationCode({
      authBase: AUTH_BASE,
      code: "c",
      verifier: "v",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ code: "insufficient_scope" });
  });

  it("fails closed when the response has no key", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ user_id: "1", scope: "api" }));
    await expect(exchangeAuthorizationCode({
      authBase: AUTH_BASE,
      code: "c",
      verifier: "v",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("parseCallbackParams", () => {
  it("accepts a matching state and returns the code", () => {
    expect(parseCallbackParams("?code=abc&state=xyz", "xyz")).toEqual({ code: "abc", error: null });
  });

  it("rejects a state mismatch before reading the code", () => {
    expect(() => parseCallbackParams("?code=abc&state=other", "xyz"))
      .toThrowError(/did not match/);
  });

  it("maps a denial to a safe terminal error", () => {
    const error = (() => {
      try {
        parseCallbackParams("?error=access_denied&state=xyz", "xyz");
      } catch (err) {
        return err as OrcaPkceError;
      }
      return null;
    })();
    expect(error?.code).toBe("denied");
  });

  it("rejects a callback with no code", () => {
    expect(() => parseCallbackParams("?state=xyz", "xyz")).toThrowError(/authorization code/);
  });
});
