import { describe, it, expect, vi } from "vitest";
import {
  ORCA_PENDING_STORAGE_KEY,
  OrcaLoginController,
  type OrcaLoginDeps,
  type PendingAttempt,
} from "@/lib/orcarouter/login-controller";
import { OrcaPkceError } from "@/lib/orcarouter/pkce";

const AUTH_BASE = "https://www.orcarouter.ai";
const CALLBACK = "http://localhost:3000/orca-callback";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function harness(overrides: Partial<OrcaLoginDeps> = {}) {
  const storage = memoryStorage();
  const exchange = vi.fn(async () => ({ key: "sk-orca-connected", scope: "api", userId: "user-1" }));
  const timers: Array<() => void> = [];
  let nowMs = 1_700_000_000_000;

  const deps: OrcaLoginDeps = {
    storage,
    authBase: AUTH_BASE,
    callbackUrl: CALLBACK,
    exchange: exchange as unknown as OrcaLoginDeps["exchange"],
    now: () => nowMs,
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length - 1;
    },
    clearTimer: () => {},
    ...overrides,
  };

  const controller = new OrcaLoginController(deps);
  return {
    controller,
    storage,
    exchange,
    timers,
    fireTimeout: () => timers.forEach((fn) => fn()),
    advance: (ms: number) => {
      nowMs += ms;
    },
    deps,
  };
}

function pendingOf(storage: ReturnType<typeof memoryStorage>): PendingAttempt {
  return JSON.parse(storage.getItem(ORCA_PENDING_STORAGE_KEY)!) as PendingAttempt;
}

describe("OrcaLoginController.start", () => {
  it("stores a fresh attempt and opens the consent page on the auth origin", async () => {
    const { controller, storage } = harness();
    const url = await controller.start();

    expect(url).toBeTruthy();
    const parsed = new URL(url!);
    expect(parsed.origin).toBe("https://www.orcarouter.ai");
    expect(parsed.pathname).toBe("/auth");
    expect(parsed.searchParams.get("callback_url")).toBe(CALLBACK);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");

    const pending = pendingOf(storage);
    expect(parsed.searchParams.get("code_challenge")).not.toBe(pending.verifier);
    expect(url).not.toContain(pending.verifier);
    expect(controller.getState().status).toBe("pending");
    expect(controller.getState().hint).toBeTruthy();
  });
});

describe("completing a login", () => {
  it("exchanges the code with the stored verifier and stores nothing itself", async () => {
    const { controller, storage, exchange } = harness();
    await controller.start();
    const pending = pendingOf(storage);

    const result = await controller.completeWithCode("auth-code-1");

    expect(result).toEqual({ key: "sk-orca-connected", scope: "api", userId: "user-1" });
    expect(exchange).toHaveBeenCalledWith({ code: "auth-code-1", verifier: pending.verifier });
    expect(controller.getState().status).toBe("success");
    expect(storage.getItem(ORCA_PENDING_STORAGE_KEY)).toBeNull();
  });

  it("adopts the pending attempt after the redirect, in a fresh controller", async () => {
    const first = harness();
    await first.controller.start();
    const pending = pendingOf(first.storage);

    const second = new OrcaLoginController({
      ...first.deps,
      exchange: first.exchange as unknown as OrcaLoginDeps["exchange"],
    });
    const result = await second.completeFromCallback(`?code=returned-code&state=${pending.state}`);

    expect(result?.key).toBe("sk-orca-connected");
    expect(first.exchange).toHaveBeenCalledWith({ code: "returned-code", verifier: pending.verifier });
    expect(second.getState().status).toBe("success");
  });

  it("rejects a callback whose state does not match without exchanging the code", async () => {
    const { controller, exchange } = harness();
    await controller.start();

    const result = await controller.completeFromCallback("?code=attacker-code&state=wrong-state");

    expect(result).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
    expect(controller.getState().error?.code).toBe("state_mismatch");
  });

  it("ends cleanly when the user denies access", async () => {
    const { controller, storage, exchange } = harness();
    await controller.start();
    const pending = pendingOf(storage);

    const result = await controller.completeFromCallback(`?error=access_denied&state=${pending.state}`);

    expect(result).toBeNull();
    expect(exchange).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe("error");
    expect(controller.getState().error?.code).toBe("denied");
    expect(storage.getItem(ORCA_PENDING_STORAGE_KEY)).toBeNull();
  });

  it("treats a rejected, expired or reused code as terminal", async () => {
    const exchange = vi.fn(async () => {
      throw new OrcaPkceError("code_rejected", "That authorization code is unknown, expired or already used.");
    });
    const { controller } = harness({ exchange: exchange as unknown as OrcaLoginDeps["exchange"] });
    await controller.start();

    const result = await controller.completeWithCode("reused-code");

    expect(result).toBeNull();
    expect(controller.getState().status).toBe("error");
    expect(controller.getState().error?.code).toBe("code_rejected");
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("maps rate limiting and network failures without looping", async () => {
    const rateLimited = harness({
      exchange: (async () => {
        throw new OrcaPkceError("rate_limited", "Too many authorizations.");
      }) as unknown as OrcaLoginDeps["exchange"],
    });
    await rateLimited.controller.start();
    await rateLimited.controller.completeWithCode("c");
    expect(rateLimited.controller.getState().error?.code).toBe("rate_limited");
    expect(rateLimited.exchange).not.toHaveBeenCalled();

    const offline = harness({
      exchange: (async () => {
        throw new OrcaPkceError("network", "Could not reach OrcaRouter.");
      }) as unknown as OrcaLoginDeps["exchange"],
    });
    await offline.controller.start();
    await offline.controller.completeWithCode("c");
    expect(offline.controller.getState().error?.code).toBe("network");
  });

  it("reports a scope downgrade instead of assuming the requested scope", async () => {
    const { controller } = harness({
      exchange: (async () => {
        throw new OrcaPkceError("insufficient_scope", "OrcaRouter granted a scope this app cannot use.");
      }) as unknown as OrcaLoginDeps["exchange"],
    });
    await controller.start();
    await controller.completeWithCode("c");
    expect(controller.getState().error?.code).toBe("insufficient_scope");
  });

  it("times out an abandoned attempt", async () => {
    const { controller, fireTimeout, storage } = harness();
    await controller.start();
    fireTimeout();
    expect(controller.getState().status).toBe("error");
    expect(controller.getState().error?.code).toBe("timeout");
    expect(storage.getItem(ORCA_PENDING_STORAGE_KEY)).toBeNull();
  });
});

describe("cancellation and page lifecycle", () => {
  it("cancel clears the pending attempt and the busy state", async () => {
    const { controller, storage } = harness();
    await controller.start();
    controller.cancel();

    expect(controller.getState().status).toBe("idle");
    expect(controller.getState().hint).toBeNull();
    expect(storage.getItem(ORCA_PENDING_STORAGE_KEY)).toBeNull();
  });

  it("pagehide clears busy/hint synchronously and allows a second login without remount", async () => {
    const { controller, storage } = harness();
    await controller.start();
    expect(controller.getState().status).toBe("pending");

    controller.handlePageHide();

    expect(controller.getState().status).toBe("idle");
    expect(controller.getState().hint).toBeNull();
    expect(controller.getState().authorizeUrl).toBeNull();
    expect(storage.getItem(ORCA_PENDING_STORAGE_KEY)).toBeNull();

    const second = await controller.start();
    expect(second).toBeTruthy();
    expect(controller.getState().status).toBe("pending");
    expect(controller.getState().generation).toBeGreaterThan(1);
  });

  it("a stale exchange response cannot overwrite a newer login", async () => {
    let resolveFirst: ((value: { key: string; scope: string; userId: string }) => void) | null = null;
    const exchange = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve as typeof resolveFirst;
      }))
      .mockImplementationOnce(async () => ({ key: "sk-orca-second", scope: "api", userId: "u2" }));

    const { controller, storage } = harness({ exchange: exchange as unknown as OrcaLoginDeps["exchange"] });

    await controller.start();
    const stale = controller.completeWithCode("first-code");
    expect(storage.getItem(ORCA_PENDING_STORAGE_KEY)).not.toBeNull();

    // A second attempt starts while the first exchange is still in flight.
    await controller.start();
    resolveFirst!({ key: "sk-orca-first", scope: "api", userId: "u1" });

    await expect(stale).resolves.toBeNull();
    expect(controller.getState().status).toBe("pending");

    const result = await controller.completeWithCode("second-code");
    expect(result?.key).toBe("sk-orca-second");
    expect(controller.getState().status).toBe("success");
  });
});
