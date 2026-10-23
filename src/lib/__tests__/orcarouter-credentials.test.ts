import { describe, it, expect } from "vitest";
import {
  createApiKeyAdapter,
  createPkceAdapter,
  credentialFromStoredAuth,
  maskSecret,
  normalizeOrcaKey,
  OrcaRouterAccessError,
  resolveOrcaRouterApiKey,
} from "@/lib/orcarouter/credentials";

describe("API-key adapter", () => {
  it("returns the same credential shape as the PKCE adapter", async () => {
    const now = () => 1_700_000_000_000;
    const apiKey = await createApiKeyAdapter("  sk-orca-pasted-key  ", now).acquire();
    const pkce = await createPkceAdapter(
      async () => ({ key: "sk-orca-connected-key", scope: "api", userId: "user-1" }),
      now
    ).acquire();

    expect(apiKey).toEqual({
      key: "sk-orca-pasted-key",
      source: "api-key",
      scope: null,
      userId: null,
      obtainedAt: 1_700_000_000_000,
    });
    expect(pkce).toMatchObject({ key: "sk-orca-connected-key", source: "pkce", scope: "api", userId: "user-1" });
    // Downstream only needs .key; both adapters satisfy the same interface.
    expect(typeof apiKey.key).toBe("string");
    expect(typeof pkce.key).toBe("string");
  });

  it("rejects an empty key", async () => {
    await expect(createApiKeyAdapter("   ").acquire()).rejects.toMatchObject({
      code: "orcarouter_api_key_missing",
      status: 401,
    });
  });

  it("rejects a key containing whitespace", async () => {
    await expect(createApiKeyAdapter("sk-orca-abc def").acquire()).rejects.toMatchObject({
      code: "orcarouter_api_key_malformed",
    });
  });

  it("rejects a PKCE result with no key", async () => {
    await expect(createPkceAdapter(async () => ({ key: "", scope: "api", userId: null })).acquire())
      .rejects.toMatchObject({ code: "orcarouter_pkce_empty_key" });
  });
});

describe("resolveOrcaRouterApiKey", () => {
  it("requires a key for OrcaRouter and never falls back to another provider", () => {
    expect(() => resolveOrcaRouterApiKey("orcarouter:openai/gpt-5.5", undefined))
      .toThrowError(OrcaRouterAccessError);
    expect(resolveOrcaRouterApiKey("orcarouter:openai/gpt-5.5", "sk-orca-user")).toBe("sk-orca-user");
  });

  it("leaves other providers untouched", () => {
    expect(resolveOrcaRouterApiKey("openai:gpt-5.4", "sk-openai")).toBe("sk-openai");
    expect(resolveOrcaRouterApiKey("anthropic:claude-opus-4-6", undefined)).toBeUndefined();
  });
});

describe("credential persistence helpers", () => {
  it("rebuilds a credential from stored auth regardless of source", () => {
    expect(credentialFromStoredAuth({ key: "sk-orca-a", source: "pkce", scope: "api" }))
      .toMatchObject({ key: "sk-orca-a", source: "pkce", scope: "api" });
    expect(credentialFromStoredAuth({ key: "sk-orca-b", source: "api-key" }))
      .toMatchObject({ key: "sk-orca-b", source: "api-key" });
    expect(credentialFromStoredAuth({})).toBeNull();
  });

  it("normalizes surrounding whitespace only", () => {
    expect(normalizeOrcaKey("  sk-orca-x ")).toBe("sk-orca-x");
    expect(normalizeOrcaKey("")).toBeUndefined();
  });
});

describe("maskSecret", () => {
  it("never renders the full credential", () => {
    const key = "sk-orca-1234567890abcdef";
    const masked = maskSecret(key);
    expect(masked).not.toBe(key);
    expect(masked.startsWith("sk-or")).toBe(true);
    expect(masked.endsWith("cdef")).toBe(true);
    expect(masked).toContain("•");
  });

  it("fully masks very short values", () => {
    expect(maskSecret("abc")).toBe("•••");
    expect(maskSecret(undefined)).toBe("");
  });
});
