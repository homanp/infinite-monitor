import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { generateText } from "ai";
import { createModel } from "@/lib/create-model";

interface CapturedRequest {
  url: string;
  authorization: string | undefined;
  body: Record<string, unknown>;
}

describe("OrcaRouter provider wiring", () => {
  let server: Server;
  let baseUrl = "";
  const captured: CapturedRequest[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        captured.push({
          url: req.url ?? "",
          authorization: req.headers.authorization,
          body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "chatcmpl-local",
          object: "chat.completion",
          created: 1,
          model: "openai/gpt-5.5",
          choices: [{ index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });

  afterAll(async () => {
    delete process.env.ORCA_API_BASE_URL;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("routes inference to the configured API origin with a Bearer key", async () => {
    captured.length = 0;
    process.env.ORCA_API_BASE_URL = baseUrl;

    const model = createModel("orcarouter:openai/gpt-5.5", "sk-orca-provider-test");
    const { text } = await generateText({ model, prompt: "ping" });

    expect(text).toBe("pong");
    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("/v1/chat/completions");
    expect(captured[0].authorization).toBe("Bearer sk-orca-provider-test");
    // The vendor/model namespace is forwarded unchanged.
    expect(captured[0].body.model).toBe("openai/gpt-5.5");
  });

  it("keeps a distinct provider id so OrcaRouter is never aliased to OpenAI", async () => {
    captured.length = 0;
    process.env.ORCA_API_BASE_URL = baseUrl;

    const model = createModel("orcarouter:orcarouter/auto", "sk-orca-provider-test");
    await generateText({ model, prompt: "ping" });

    expect(captured[0].body.model).toBe("orcarouter/auto");
  });
});
