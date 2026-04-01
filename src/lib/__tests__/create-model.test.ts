import { describe, it, expect } from "vitest";
import { isAnthropicModel } from "@/lib/create-model";

describe("isAnthropicModel", () => {
  it("returns true for explicit anthropic prefix", () => {
    expect(isAnthropicModel("anthropic:claude-sonnet-4-6")).toBe(true);
  });

  it("returns true for bare model string without colon", () => {
    expect(isAnthropicModel("claude-sonnet-4-6")).toBe(true);
  });

  it("returns false for other providers", () => {
    expect(isAnthropicModel("openai:gpt-5.4")).toBe(false);
    expect(isAnthropicModel("google:gemini-2.5-pro")).toBe(false);
    expect(isAnthropicModel("xai:grok-3")).toBe(false);
    expect(isAnthropicModel("openrouter:qwen/qwen3-coder:free")).toBe(false);
  });

  it("returns true for empty string (no colon)", () => {
    expect(isAnthropicModel("")).toBe(true);
  });
});
