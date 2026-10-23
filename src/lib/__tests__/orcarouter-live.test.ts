import { describe, it, expect } from "vitest";
import { generateText } from "ai";
import { createModel } from "@/lib/create-model";
import { fetchOrcaCatalog, filterModels } from "@/lib/orcarouter/catalog";
import { DEFAULT_ORCA_API_BASE_URL } from "@/lib/orcarouter/config";

const LIVE_KEY = process.env.ORCAROUTER_API_KEY?.trim();

/**
 * Live checks only run when a real OrcaRouter key is present. They exercise
 * the same provider path the chat route uses (`createModel`) and the real
 * model catalog endpoint.
 */
describe.skipIf(!LIVE_KEY)("OrcaRouter live", () => {
  it("discovers the workspace catalog and filters it per capability", async () => {
    const models = await fetchOrcaCatalog({
      apiBase: DEFAULT_ORCA_API_BASE_URL,
      apiKey: LIVE_KEY!,
    });

    expect(models.length).toBeGreaterThan(0);
    const chatModels = filterModels(models, { capability: "chat" });
    expect(chatModels.length).toBeGreaterThan(0);
    // Everything offered for chat must be text-capable.
    for (const model of chatModels) {
      expect(model.supportedEndpointTypes.some((type) =>
        ["openai", "anthropic", "gemini", "openai-response"].includes(type)
      ) || model.capability === "chat").toBe(true);
    }
    const multimodal = filterModels(models, { capability: "chat", inputModalities: ["text", "image"] });
    for (const model of multimodal) {
      expect(model.inputModalities).toContain("image");
    }
    console.info(`[live] catalog=${models.length} chat=${chatModels.length} multimodal=${multimodal.length}`);
  }, 120_000);

  it("completes a real request through the OrcaRouter provider", async () => {
    const models = await fetchOrcaCatalog({
      apiBase: DEFAULT_ORCA_API_BASE_URL,
      apiKey: LIVE_KEY!,
    });
    const chatModels = filterModels(models, { capability: "chat" });
    expect(chatModels.length).toBeGreaterThan(0);

    // A workspace catalog lists models the *workspace* can route; an
    // individual key can still be scoped to a subset. Try the vendor-namespaced
    // models first (the gateway's own aliases are commonly key-scoped), then
    // the rest, and report which model actually answered.
    const preferred = chatModels.find((model) => model.id === "orcarouter/auto");
    const vendorModels = chatModels.filter((model) => !model.id.startsWith("orcarouter/"));
    const gatewayModels = chatModels.filter(
      (model) => model.id.startsWith("orcarouter/") && model !== preferred
    );
    const ordered = preferred ? [preferred, ...vendorModels, ...gatewayModels] : [...vendorModels, ...gatewayModels];

    let answered: { id: string; text: string } | null = null;
    const denied: string[] = [];
    for (const candidate of ordered) {
      const model = createModel(`orcarouter:${candidate.id}`, LIVE_KEY);
      try {
        const { text } = await generateText({
          model,
          prompt: "Reply with the single word: pong",
        });
        if (text.trim()) {
          answered = { id: candidate.id, text };
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/does not have access|403|forbidden/i.test(message)) {
          denied.push(candidate.id);
          continue;
        }
        throw error;
      }
    }

    expect(denied.length + (answered ? 1 : 0)).toBeGreaterThan(0);
    expect(answered).not.toBeNull();
    console.info(
      `[live] model=${answered!.id} reply=${answered!.text.slice(0, 60)} denied=${denied.length}`
    );
  }, 300_000);
});
