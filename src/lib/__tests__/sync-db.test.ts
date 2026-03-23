import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CANVAS_VIEWPORT } from "@/lib/canvas-viewport";

function buildDurableState() {
  return {
    dashboards: [{
      id: "dash-1",
      title: "Dashboard",
      widgetIds: ["widget-1"],
      textBlockIds: ["text-1"],
      createdAt: 0,
    }],
    widgets: [{
      id: "widget-1",
      title: "Widget",
      description: "",
      messages: [],
      layout: { x: 0, y: 0, w: 4, h: 3 },
      code: null,
      files: {},
      iframeVersion: 0,
    }],
    textBlocks: [{
      id: "text-1",
      text: "Hello",
      fontSize: 16,
      layout: { x: 0, y: 0, w: 3, h: 1 },
    }],
    viewports: {},
  };
}

function buildStoreState() {
  return {
    ...buildDurableState(),
    activeDashboardId: "dash-1",
    activeWidgetId: null,
    streamingWidgetIds: [],
    currentActions: {},
    reasoningStreamingIds: [],
  };
}

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("buildSyncPayloadFromStoreState", () => {
  it("serializes durable state and fills the default viewport", async () => {
    const { buildSyncPayloadFromStoreState } = await import("@/store/widget-store");

    expect(buildSyncPayloadFromStoreState(buildDurableState())).toEqual({
      dashboards: [{
        id: "dash-1",
        title: "Dashboard",
        widgetIds: ["widget-1"],
        textBlockIds: ["text-1"],
        createdAt: 0,
        viewport: DEFAULT_CANVAS_VIEWPORT,
      }],
      widgets: [{
        id: "widget-1",
        title: "Widget",
        description: "",
        code: null,
        files: {},
        layout: { x: 0, y: 0, w: 4, h: 3 },
        messages: [],
      }],
      textBlocks: [{
        id: "text-1",
        text: "Hello",
        fontSize: 16,
        layout: { x: 0, y: 0, w: 3, h: 1 },
      }],
    });
  });
});

describe("centralized durable-state sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage });
  });

  it("syncs widget layout changes through /api/sync", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { useWidgetStore } = await import("@/store/widget-store");
    useWidgetStore.setState(buildStoreState());

    useWidgetStore.getState().updateWidgetLayout("widget-1", { x: 3, y: 4 });

    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/sync");

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(requestInit?.body));

    expect(payload.dashboards[0]).toMatchObject({
      id: "dash-1",
      widgetIds: ["widget-1"],
      textBlockIds: ["text-1"],
    });
    expect(payload.widgets[0]?.layout).toEqual({ x: 3, y: 4, w: 4, h: 3 });
  });

  it("debounces repeated interactive updates and syncs the latest payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { useWidgetStore } = await import("@/store/widget-store");
    useWidgetStore.setState(buildStoreState());

    useWidgetStore.getState().updateWidgetLayout("widget-1", { x: 1 });
    await vi.advanceTimersByTimeAsync(100);
    useWidgetStore.getState().updateWidgetLayout("widget-1", { x: 2 });

    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(requestInit?.body));

    expect(payload.widgets[0]?.layout).toEqual({ x: 2, y: 0, w: 4, h: 3 });
  });

  it("syncs removals as authoritative snapshots", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { useWidgetStore } = await import("@/store/widget-store");
    useWidgetStore.setState(buildStoreState());

    useWidgetStore.getState().removeWidget("widget-1");
    await vi.advanceTimersByTimeAsync(250);

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(requestInit?.body));

    expect(payload.widgets).toEqual([]);
    expect(payload.dashboards[0]?.widgetIds).toEqual([]);
  });

  it("serializes follow-up syncs behind an in-flight request", async () => {
    const firstSync = createDeferred<Response>();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => firstSync.promise)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { useWidgetStore } = await import("@/store/widget-store");
    useWidgetStore.setState(buildStoreState());

    useWidgetStore.getState().updateWidgetLayout("widget-1", { x: 3 });
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    useWidgetStore.getState().renameWidget("widget-1", "Renamed");
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstSync.resolve(new Response(null, { status: 200 }));
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondRequestInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    const secondPayload = JSON.parse(String(secondRequestInit?.body));

    expect(secondPayload.widgets[0]).toMatchObject({
      title: "Renamed",
      layout: { x: 3, y: 0, w: 4, h: 3 },
    });
  });

  it("flushSyncToServer waits for the latest state after an in-flight sync", async () => {
    const firstSync = createDeferred<Response>();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => firstSync.promise)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { flushSyncToServer } = await import("@/lib/sync-db");
    const { useWidgetStore } = await import("@/store/widget-store");
    useWidgetStore.setState(buildStoreState());

    useWidgetStore.getState().updateWidgetLayout("widget-1", { x: 5 });
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    useWidgetStore.getState().renameWidget("widget-1", "Ready");
    const flushTask = flushSyncToServer();
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstSync.resolve(new Response(null, { status: 200 }));
    await flushTask;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondRequestInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    const secondPayload = JSON.parse(String(secondRequestInit?.body));

    expect(secondPayload.widgets[0]).toMatchObject({
      title: "Ready",
      layout: { x: 5, y: 0, w: 4, h: 3 },
    });
  });
});
