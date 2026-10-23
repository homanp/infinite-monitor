import { describe, it, expect } from "vitest";
import {
  assertSecureOrigin,
  buildModelsUrl,
  DEFAULT_ORCA_API_BASE_URL,
  DEFAULT_ORCA_AUTH_BASE_URL,
  resolveOrcaOrigins,
} from "@/lib/orcarouter/config";

describe("resolveOrcaOrigins", () => {
  it("defaults to the public auth and inference origins", () => {
    expect(resolveOrcaOrigins({})).toEqual({
      authBase: "https://www.orcarouter.ai",
      apiBase: "https://api.orcarouter.ai/v1",
    });
    expect(DEFAULT_ORCA_AUTH_BASE_URL).toBe("https://www.orcarouter.ai");
    expect(DEFAULT_ORCA_API_BASE_URL).toBe("https://api.orcarouter.ai/v1");
  });

  it("lets explicit overrides win over the shared self-hosted base", () => {
    const origins = resolveOrcaOrigins({
      ORCA_BASE_URL: "https://orca.internal",
      ORCA_AUTH_BASE_URL: "https://login.internal",
      ORCA_API_BASE_URL: "https://relay.internal/v1",
    });
    expect(origins.authBase).toBe("https://login.internal");
    expect(origins.apiBase).toBe("https://relay.internal/v1");
  });

  it("uses the shared base for both origins when no explicit value is set", () => {
    const origins = resolveOrcaOrigins({ ORCA_BASE_URL: "https://orca.internal" });
    expect(origins.authBase).toBe("https://orca.internal");
    expect(origins.apiBase).toBe("https://orca.internal/v1");
  });

  it("never derives one public origin from the other", () => {
    const origins = resolveOrcaOrigins({});
    expect(new URL(origins.authBase).hostname).toBe("www.orcarouter.ai");
    expect(new URL(origins.apiBase).hostname).toBe("api.orcarouter.ai");
    expect(origins.apiBase).not.toContain("www.orcarouter.ai");
  });

  it("rejects plain HTTP for non-loopback hosts", () => {
    expect(() => resolveOrcaOrigins({ ORCA_AUTH_BASE_URL: "http://orcarouter.example" }))
      .toThrowError(/HTTPS/);
  });

  it("allows HTTP loopback for local development", () => {
    const origins = resolveOrcaOrigins({ ORCA_API_BASE_URL: "http://127.0.0.1:8080/v1" });
    expect(origins.apiBase).toBe("http://127.0.0.1:8080/v1");
  });

  it("rejects credentials and query strings in configured origins", () => {
    expect(() => assertSecureOrigin("https://user:pass@orcarouter.example", "ORCA_AUTH_BASE_URL"))
      .toThrowError(/credentials/);
    expect(() => assertSecureOrigin("https://orcarouter.example?x=1", "ORCA_AUTH_BASE_URL"))
      .toThrowError(/query/);
  });
});

describe("buildModelsUrl", () => {
  it("requests the capability from the API origin", () => {
    const url = new URL(buildModelsUrl("https://api.orcarouter.ai/v1", "chat"));
    expect(url.origin).toBe("https://api.orcarouter.ai");
    expect(url.pathname).toBe("/v1/models");
    expect(url.searchParams.get("capability")).toBe("chat");
  });
});
