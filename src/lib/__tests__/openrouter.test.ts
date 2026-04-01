import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetOpenRouterStarterRateLimitForTests,
  hasOpenRouterStarter,
  OpenRouterAccessError,
  resolveOpenRouterApiKey,
} from "@/lib/openrouter";

function makeRequest(ip = "203.0.113.10") {
  return new Request("http://localhost/api/chat", {
    headers: {
      "x-forwarded-for": ip,
      "user-agent": "vitest",
    },
  });
}

describe("resolveOpenRouterApiKey", () => {
  beforeEach(() => {
    __resetOpenRouterStarterRateLimitForTests();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    __resetOpenRouterStarterRateLimitForTests();
    vi.unstubAllEnvs();
  });

  it("uses the shared key for starter models", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "starter-key");

    const apiKey = resolveOpenRouterApiKey(
      "openrouter:qwen/qwen3-coder:free",
      undefined,
      makeRequest(),
      { route: "chat", widgetId: "widget-1" }
    );

    expect(apiKey).toBe("starter-key");
  });

  it("rejects non-allowlisted OpenRouter models without BYOK", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "starter-key");

    expect(() =>
      resolveOpenRouterApiKey(
        "openrouter:anthropic/claude-sonnet-4.6",
        undefined,
        makeRequest(),
        { route: "chat", widgetId: "widget-1" }
      )
    ).toThrowError(OpenRouterAccessError);
  });

  it("lets a user OpenRouter key bypass the starter allowlist", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "starter-key");

    const apiKey = resolveOpenRouterApiKey(
      "openrouter:anthropic/claude-sonnet-4.6",
      "user-key",
      makeRequest(),
      { route: "chat", widgetId: "widget-1" }
    );

    expect(apiKey).toBe("user-key");
  });

  it("fails cleanly when starter access is not configured", () => {
    expect(() =>
      resolveOpenRouterApiKey(
        "openrouter:qwen/qwen3-coder:free",
        undefined,
        makeRequest(),
        { route: "chat", widgetId: "widget-1" }
      )
    ).toThrowError(OpenRouterAccessError);
  });

  it("supports disabling starter access with an env flag", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "starter-key");
    vi.stubEnv("OPENROUTER_STARTER_DISABLED", "1");

    expect(hasOpenRouterStarter()).toBe(false);
    expect(() =>
      resolveOpenRouterApiKey(
        "openrouter:qwen/qwen3-coder:free",
        undefined,
        makeRequest(),
        { route: "chat", widgetId: "widget-1" }
      )
    ).toThrowError(OpenRouterAccessError);
  });

  it("rate limits repeated starter requests from the same client", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "starter-key");
    vi.stubEnv("OPENROUTER_STARTER_RATE_LIMIT", "1");

    resolveOpenRouterApiKey("openrouter:qwen/qwen3-coder:free", undefined, makeRequest(), {
      route: "chat",
      widgetId: "widget-1",
    });

    expect(() =>
      resolveOpenRouterApiKey("openrouter:qwen/qwen3-coder:free", undefined, makeRequest(), {
        route: "chat",
        widgetId: "widget-1",
      })
    ).toThrowError(OpenRouterAccessError);
  });
});
