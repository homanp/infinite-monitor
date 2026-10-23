import { describe, it, expect, vi, afterEach } from "vitest";
import { GET as getModels } from "@/app/api/orcarouter/models/route";
import { POST as exchangeCode } from "@/app/api/orcarouter/oauth/exchange/route";
import { GET as getConfig } from "@/app/api/orcarouter/config/route";

const CATALOG_PAYLOAD = {
  data: [
    {
      id: "openai/gpt-5.5",
      name: "GPT-5.5",
      architecture: { input_modalities: ["text", "image"] },
      supported_endpoint_types: ["openai", "openai-response"],
      capability: "chat",
    },
    {
      id: "google/imagen-5",
      name: "Imagen 5",
      supported_endpoint_types: ["image-generation"],
      capability: "image",
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ORCA_API_BASE_URL;
  delete process.env.ORCA_AUTH_BASE_URL;
});

describe("GET /api/orcarouter/models", () => {
  it("requires the credential in the Authorization header, never in the URL", async () => {
    const response = await getModels(new Request("http://localhost/api/orcarouter/models?capability=chat"));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("orcarouter_credential_required");
  });

  it("forwards discovery to the configured API origin with a Bearer key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(CATALOG_PAYLOAD), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getModels(new Request("http://localhost/api/orcarouter/models?capability=chat", {
      headers: { Authorization: "Bearer sk-orca-user-key" },
    }));
    const body = await response.json();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.orcarouter.ai/v1/models?capability=chat");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-orca-user-key");
    expect(body.source).toBe("live");
    expect(body.models.map((model: { id: string }) => model.id)).toEqual(["openai/gpt-5.5"]);
    expect(JSON.stringify(body)).not.toContain("sk-orca-user-key");
  });

  it("reports upstream rejection without leaking the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));

    const response = await getModels(new Request("http://localhost/api/orcarouter/models", {
      headers: { Authorization: "Bearer sk-orca-revoked" },
    }));
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("sk-orca-revoked");
  });

  it("rejects unknown capabilities", async () => {
    const response = await getModels(new Request("http://localhost/api/orcarouter/models?capability=telepathy", {
      headers: { Authorization: "Bearer sk-orca-user-key" },
    }));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/orcarouter/oauth/exchange", () => {
  it("exchanges on the auth origin and returns the durable key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      key: "sk-orca-issued",
      user_id: "42",
      scope: "api",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await exchangeCode(new Request("http://localhost/api/orcarouter/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code: "one-time", codeVerifier: "verifier-abc" }),
    }));
    const body = await response.json();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.orcarouter.ai/api/v1/auth/keys");
    expect(url).not.toContain("api.orcarouter.ai");
    expect(JSON.parse(String(init.body))).toEqual({
      code: "one-time",
      code_verifier: "verifier-abc",
      code_challenge_method: "S256",
    });
    expect(body).toEqual({ key: "sk-orca-issued", scope: "api", userId: "42" });
  });

  it("maps a rejected code to 403 without echoing the code or verifier", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));

    const response = await exchangeCode(new Request("http://localhost/api/orcarouter/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code: "secret-code", codeVerifier: "secret-verifier" }),
    }));

    expect(response.status).toBe(403);
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("secret-code");
    expect(text).not.toContain("secret-verifier");
  });

  it("rejects malformed requests", async () => {
    const response = await exchangeCode(new Request("http://localhost/api/orcarouter/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code: "", codeVerifier: "" }),
    }));
    expect(response.status).toBe(400);
  });

  it("honours an explicit auth override", async () => {
    process.env.ORCA_AUTH_BASE_URL = "https://auth.internal.example";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      key: "sk-orca-issued", user_id: "1", scope: "api",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await exchangeCode(new Request("http://localhost/api/orcarouter/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code: "c", codeVerifier: "v" }),
    }));

    expect((fetchMock.mock.calls[0] as unknown as [string])[0])
      .toBe("https://auth.internal.example/api/v1/auth/keys");
  });
});

describe("GET /api/orcarouter/config", () => {
  it("exposes only the public origins", async () => {
    const response = await getConfig();
    expect(await response.json()).toEqual({
      authBase: "https://www.orcarouter.ai",
      apiBase: "https://api.orcarouter.ai/v1",
    });
  });
});
