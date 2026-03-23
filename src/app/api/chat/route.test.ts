import { afterEach, describe, expect, it, vi } from "vitest";

const streamText = vi.fn();
const maybeCreateSharedSessionRecorder = vi.fn();

vi.mock("ai", () => ({
  streamText,
  stepCountIs: vi.fn(() => "stop"),
  tool: vi.fn((config) => config),
}));

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: vi.fn(),
}));

vi.mock("@/lib/create-model", () => ({
  createModel: vi.fn(() => ({ provider: "mock-model" })),
  isAnthropicModel: vi.fn(() => false),
}));

vi.mock("just-bash", () => ({
  Bash: class {
    async exec() {
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  },
}));

vi.mock("bash-tool", () => ({
  createBashTool: vi.fn(async () => ({ tools: {} })),
}));

vi.mock("@/lib/widget-runner", () => ({
  writeWidgetFile: vi.fn(async () => {}),
  readWidgetFile: vi.fn(async () => null),
  rebuildWidget: vi.fn(async () => null),
}));

vi.mock("@/db/widgets", () => ({
  getAllDashboards: vi.fn(() => []),
  getWidget: vi.fn(() => ({ id: "widget-1", title: "Widget" })),
  getWidgetFiles: vi.fn(() => ({})),
}));

vi.mock("@/lib/web-search", () => ({
  webSearch: vi.fn(),
}));

vi.mock("@/lib/brin", () => ({
  scanUrls: vi.fn(),
}));

vi.mock("@/lib/session-stream", () => ({
  maybeCreateSharedSessionRecorder,
  scheduleSharedDashboardAppendForWidget: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("POST /api/chat", () => {
  it("waits for the shared trace flush before closing the SSE stream", async () => {
    const flushDeferred = createDeferred<void>();
    const flush = vi.fn(() => flushDeferred.promise);

    maybeCreateSharedSessionRecorder.mockResolvedValue({
      shareId: "shr_test",
      dashboardId: "dash-1",
      publishedWidgetId: "share--shr_test--widget-1",
      widgetTitle: "Widget",
      startRun: vi.fn(),
      record: vi.fn(),
      finish: vi.fn(),
      flush,
    });

    streamText.mockReturnValue({
      fullStream: (async function* () {})(),
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [],
        widgetId: "widget-1",
      }),
    });

    const response = await POST(request);
    expect(response.body).toBeTruthy();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const firstChunk = await reader.read();
    expect(decoder.decode(firstChunk.value)).toContain("\"type\":\"done\"");
    expect(flush).toHaveBeenCalledTimes(1);

    const secondRead = reader.read();
    let settled = false;
    void secondRead.then(() => {
      settled = true;
    });

    await flushMicrotasks();
    expect(settled).toBe(false);

    flushDeferred.resolve();
    const secondChunk = await secondRead;
    expect(decoder.decode(secondChunk.value)).toContain("[DONE]");

    const streamEnd = await reader.read();
    expect(streamEnd.done).toBe(true);
  });
});
