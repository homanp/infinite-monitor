/**
 * GUI lifecycle for the OrcaRouter connect flow.
 *
 * Kept framework-agnostic so the exact same state machine the React panel
 * uses can be exercised in tests: generation-guarded async work, explicit
 * cancel, and a synchronous `pagehide` reset (a back-forward-cache restore
 * must not come back busy because a guarded `finally` refused to write state).
 */

import {
  buildAuthorizeUrl,
  createPkceAttempt,
  exchangeAuthorizationCode,
  parseCallbackParams,
  OrcaPkceError,
  type ExchangedKey,
  type PkceAttempt,
} from "@/lib/orcarouter/pkce";

export const ORCA_PENDING_STORAGE_KEY = "orcarouter.pkce.pending";
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

export interface OrcaLoginStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type OrcaLoginStatus = "idle" | "pending" | "exchanging" | "success" | "error";

export interface OrcaLoginState {
  status: OrcaLoginStatus;
  generation: number;
  hint: string | null;
  error: { code: string; message: string } | null;
  authorizeUrl: string | null;
}

export interface PendingAttempt extends PkceAttempt {
  generation: number;
  startedAt: number;
}

export interface OrcaLoginDeps {
  storage: OrcaLoginStorage;
  authBase: string;
  callbackUrl: string;
  appName?: string;
  /** Popup opener (tests, or clients that prefer a new tab). */
  openUrl?: (url: string) => void;
  /** Same-tab navigation used by the web app so the redirect returns here. */
  navigate?: (url: string) => void;
  exchange?: (params: { code: string; verifier: string }) => Promise<ExchangedKey>;
  cryptoImpl?: Crypto;
  now?: () => number;
  timeoutMs?: number;
  /** Injected for tests; defaults to global setTimeout. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const INITIAL_STATE: OrcaLoginState = {
  status: "idle",
  generation: 0,
  hint: null,
  error: null,
  authorizeUrl: null,
};

export class OrcaLoginController {
  private state: OrcaLoginState = { ...INITIAL_STATE };
  private listeners = new Set<(state: OrcaLoginState) => void>();
  private timer: unknown = null;
  private redirecting = false;
  private readonly deps: OrcaLoginDeps;

  constructor(deps: OrcaLoginDeps) {
    this.deps = deps;
  }

  getState(): OrcaLoginState {
    return this.state;
  }

  subscribe(listener: (state: OrcaLoginState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The pending attempt survives the redirect to the consent screen. */
  getPendingAttempt(): PendingAttempt | null {
    const raw = this.deps.storage.getItem(ORCA_PENDING_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PendingAttempt;
      if (typeof parsed?.verifier !== "string" || typeof parsed?.state !== "string") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async start(): Promise<string | null> {
    this.clearTimer();
    const generation = this.state.generation + 1;
    const attempt = await createPkceAttempt(this.deps.cryptoImpl);

    // A newer attempt started while the verifier was being generated.
    if (this.state.generation >= generation) return null;

    const pending: PendingAttempt = {
      ...attempt,
      generation,
      startedAt: (this.deps.now ?? Date.now)(),
    };
    this.deps.storage.setItem(ORCA_PENDING_STORAGE_KEY, JSON.stringify(pending));

    const authorizeUrl = buildAuthorizeUrl({
      authBase: this.deps.authBase,
      callbackUrl: this.deps.callbackUrl,
      attempt,
      appName: this.deps.appName ?? "Infinite Monitor",
      scope: "api",
    });

    this.setState({
      status: "pending",
      generation,
      hint: "Approve the request in the OrcaRouter tab, then come back here.",
      error: null,
      authorizeUrl,
    });

    this.timer = (this.deps.setTimer ?? setTimeout)(() => {
      if (this.state.generation !== generation) return;
      this.fail("timeout", "OrcaRouter authorization timed out. Start the connection again.");
    }, this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const open = this.deps.navigate ?? this.deps.openUrl ?? ((url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
    if (this.deps.navigate) {
      // Same-tab redirect: the pending verifier must survive `pagehide`.
      this.redirecting = true;
    }
    try {
      open(authorizeUrl);
    } catch {
      this.redirecting = false;
      // The UI still exposes the copied authorization URL.
    }

    return authorizeUrl;
  }

  /** Called by the redirect landing page with its query string. */
  async completeFromCallback(search: string): Promise<ExchangedKey | null> {
    const pending = this.getPendingAttempt();
    if (!pending) {
      this.fail("state_mismatch", "This authorization response does not belong to a login started here.");
      return null;
    }

    let code: string;
    try {
      code = parseCallbackParams(search, pending.state).code!;
    } catch (error) {
      if (error instanceof OrcaPkceError) {
        this.fail(error.code, error.message);
        return null;
      }
      this.fail("invalid_request", "Could not read the OrcaRouter authorization response.");
      return null;
    }

    return this.exchange(pending, code);
  }

  /** Manual completion path (tests and the pasted-code affordance). */
  async completeWithCode(code: string): Promise<ExchangedKey | null> {
    const pending = this.getPendingAttempt();
    if (!pending) {
      this.fail("state_mismatch", "Start the OrcaRouter connection before completing it.");
      return null;
    }
    if (!code.trim()) {
      this.fail("invalid_request", "Paste the authorization code shown by OrcaRouter.");
      return null;
    }
    return this.exchange(pending, code.trim());
  }

  cancel(): void {
    this.invalidate();
    this.setState({
      status: "idle",
      generation: this.state.generation,
      hint: null,
      error: null,
      authorizeUrl: null,
    });
  }

  /**
   * Back-forward cache safety. Runs synchronously: invalidate the generation
   * and clear busy/hint here rather than relying on a guarded async cleanup.
   * A pending verifier is only discarded when this page is not handing the
   * user off to the consent screen.
   */
  handlePageHide(): void {
    const keepPending = this.redirecting;
    this.state = { ...this.state, generation: this.state.generation + 1 };
    this.clearTimer();
    if (!keepPending) {
      this.deps.storage.removeItem(ORCA_PENDING_STORAGE_KEY);
    }
    this.setState({
      status: "idle",
      generation: this.state.generation,
      hint: null,
      error: null,
      authorizeUrl: null,
    });
  }

  dispose(): void {
    this.clearTimer();
    // Unmounting (route change, panel teardown) releases the login lock: any
    // in-flight exchange resolves into this dead generation and is discarded.
    // The pending verifier itself is kept so a redirect landing page can adopt it.
    this.state = { ...this.state, generation: this.state.generation + 1 };
    this.listeners.clear();
  }

  private async exchange(pending: PendingAttempt, code: string): Promise<ExchangedKey | null> {
    if (!this.adoptPending(pending)) return null;
    const generation = pending.generation;
    if (generation !== this.state.generation) {
      // A newer attempt owns the UI now; never let a stale response win.
      return null;
    }

    this.setState({ ...this.state, status: "exchanging", hint: "Finishing the OrcaRouter connection…", error: null });

    const exchange = this.deps.exchange ?? ((params) =>
      exchangeAuthorizationCode({ authBase: this.deps.authBase, ...params }));

    try {
      const result = await exchange({ code, verifier: pending.verifier });
      if (generation !== this.state.generation) return null;
      this.clearTimer();
      this.deps.storage.removeItem(ORCA_PENDING_STORAGE_KEY);
      this.setState({
        status: "success",
        generation,
        hint: null,
        error: null,
        authorizeUrl: null,
      });
      return result;
    } catch (error) {
      if (generation !== this.state.generation) return null;
      const pkceError = error instanceof OrcaPkceError
        ? error
        : new OrcaPkceError("network", "Could not complete the OrcaRouter connection.");
      this.fail(pkceError.code, pkceError.message);
      return null;
    }
  }

  /**
   * The redirect landing page runs in a fresh controller; adopt the pending
   * attempt it was handed, but only while that attempt is still current.
   */
  private adoptPending(pending: PendingAttempt): boolean {
    if (this.state.status !== "idle") {
      return pending.generation === this.state.generation;
    }
    const now = (this.deps.now ?? Date.now)();
    const startedAt = typeof pending.startedAt === "number" ? pending.startedAt : NaN;
    const maxAge = this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(startedAt) || now - startedAt < 0 || now - startedAt > maxAge) {
      return false;
    }
    this.state = { ...this.state, generation: pending.generation };
    return true;
  }

  private fail(code: string, message: string): void {
    this.clearTimer();
    this.deps.storage.removeItem(ORCA_PENDING_STORAGE_KEY);
    this.setState({
      ...this.state,
      status: "error",
      hint: null,
      error: { code, message },
      authorizeUrl: null,
    });
  }

  private invalidate(): void {
    this.clearTimer();
    this.state = { ...this.state, generation: this.state.generation + 1 };
    this.deps.storage.removeItem(ORCA_PENDING_STORAGE_KEY);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      (this.deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)))(this.timer);
      this.timer = null;
    }
  }

  private setState(next: OrcaLoginState): void {
    this.state = next;
    for (const listener of this.listeners) listener(this.state);
  }
}
