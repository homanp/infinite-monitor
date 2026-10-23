"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2, LogIn, Trash2 } from "lucide-react";
import {
  createApiKeyAdapter,
  createPkceAdapter,
  maskSecret,
  type OrcaCredentialSource,
} from "@/lib/orcarouter/credentials";
import {
  OrcaLoginController,
  type OrcaLoginState,
} from "@/lib/orcarouter/login-controller";
import {
  createSessionStorageAdapter,
  exchangeCodeViaRoute,
  fetchOrcaClientConfig,
} from "@/lib/orcarouter/client";
import type { OrcaRouterAuthState } from "@/store/settings-store";

const ORCA_DASHBOARD_URL = "https://www.orcarouter.ai/console/api-keys";
const DEFAULT_AUTH_BASE = "https://www.orcarouter.ai";

interface OrcaRouterAuthPanelProps {
  savedKey?: string;
  auth: OrcaRouterAuthState;
  onRemoveCredential: () => void;
  onCredential: (credential: {
    key: string;
    source: OrcaCredentialSource;
    scope: string | null;
    userId: string | null;
  }) => void;
}

const INITIAL_LOGIN: OrcaLoginState = {
  status: "idle",
  generation: 0,
  hint: null,
  error: null,
  authorizeUrl: null,
};

export function OrcaRouterAuthPanel({
  savedKey,
  auth,
  onRemoveCredential,
  onCredential,
}: OrcaRouterAuthPanelProps) {
  const [keyInput, setKeyInput] = useState("");
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [authBase, setAuthBase] = useState(DEFAULT_AUTH_BASE);
  const [login, setLogin] = useState<OrcaLoginState>(INITIAL_LOGIN);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrcaClientConfig().then((config) => {
      if (!cancelled) setAuthBase(config.authBase);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const controller = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new OrcaLoginController({
      storage: createSessionStorageAdapter(),
      authBase,
      callbackUrl: `${window.location.origin}/orca-callback`,
      appName: "Infinite Monitor",
      exchange: exchangeCodeViaRoute,
      navigate: (url) => {
        window.location.assign(url);
      },
    });
  }, [authBase]);

  useEffect(() => {
    if (!controller) return;
    const unsubscribe = controller.subscribe(setLogin);
    const onPageHide = () => {
      // Synchronous: clear busy/hint even if the page is restored from bfcache.
      controller.handlePageHide();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", onPageHide);
      controller.dispose();
    };
  }, [controller]);

  const busy = login.status === "pending" || login.status === "exchanging";

  const handleSaveKey = useCallback(async () => {
    setLocalError(null);
    try {
      // API-key adapter: the pasted key becomes the same credential result
      // the PKCE adapter produces.
      const credential = await createApiKeyAdapter(keyInput).acquire();
      onCredential({
        key: credential.key,
        source: credential.source,
        scope: credential.scope,
        userId: credential.userId,
      });
      setKeyInput("");
      setShowKeyForm(false);
    } catch (error) {
      setLocalError((error as Error).message);
    }
  }, [keyInput, onCredential]);

  const handleConnect = useCallback(async () => {
    if (!controller) return;
    setLocalError(null);
    setShowCodeForm(false);
    await controller.start();
  }, [controller]);

  const handleCancel = useCallback(() => {
    controller?.cancel();
  }, [controller]);

  const handleCompleteCode = useCallback(async () => {
    if (!controller) return;
    setLocalError(null);
    const result = await controller.completeWithCode(codeInput);
    if (!result) return;
    try {
      // PKCE adapter: same credential shape, different acquisition path.
      const credential = await createPkceAdapter(async () => result).acquire();
      onCredential({
        key: credential.key,
        source: credential.source,
        scope: credential.scope,
        userId: credential.userId,
      });
      setCodeInput("");
      setShowCodeForm(false);
    } catch (error) {
      setLocalError((error as Error).message);
    }
  }, [codeInput, controller, onCredential]);

  const savedCredentialLabel = useMemo(() => {
    if (!savedKey) return null;
    return maskSecret(savedKey);
  }, [savedKey]);

  const sourceLabel = auth.source === "pkce"
    ? "Connected account"
    : auth.source === "api-key"
      ? "API key"
      : null;

  return (
    <div
      data-testid="orca-auth-methods"
      className="space-y-2 border border-zinc-800 bg-zinc-950 p-2.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">OrcaRouter access</span>
        <a
          href={ORCA_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          API keys
          <ExternalLink className="size-2.5" />
        </a>
      </div>

      {savedKey ? (
        <div
          data-testid="orca-saved-credential"
          className="flex items-center justify-between gap-2 border border-zinc-800 bg-black px-2 py-1.5"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <Check className="size-3 shrink-0 text-emerald-400" />
            <code className="truncate text-[11px] text-zinc-300">{savedCredentialLabel}</code>
            {sourceLabel && (
              <span className="shrink-0 text-[9px] uppercase tracking-wider text-zinc-500">
                {sourceLabel}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setShowKeyForm((value) => !value)}
              className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Replace
            </button>
            <button
              type="button"
              data-testid="orca-remove-credential"
              onClick={onRemoveCredential}
              className="p-0.5 text-zinc-600 transition-colors hover:text-red-400"
              aria-label="Remove OrcaRouter credential"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
      ) : null}

      {auth.needsReauth && (
        <p data-testid="orca-needs-reauth" className="border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
          OrcaRouter rejected this credential. Connect the account again or paste a new API key.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="orca-api-key" className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
            <KeyRound className="size-2.5" />
            API key
          </label>
          <input
            id="orca-api-key"
            data-testid="orca-api-key-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSaveKey();
            }}
            placeholder="sk-orca-…"
            className="w-full border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
          <button
            type="button"
            data-testid="orca-api-key-save"
            onClick={handleSaveKey}
            disabled={!keyInput.trim()}
            className="w-full bg-zinc-800 px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save key
          </button>
        </div>

        <div className="space-y-1.5">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
            <LogIn className="size-2.5" />
            Account
          </span>
          <button
            type="button"
            data-testid="orca-connect-button"
            onClick={handleConnect}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <LogIn className="size-3" />}
            Connect with OrcaRouter
          </button>
          <button
            type="button"
            onClick={() => setShowCodeForm((value) => !value)}
            className="w-full text-left text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            {showCodeForm ? "Hide code entry" : "Have a code? Paste it here"}
          </button>
        </div>
      </div>

      {showCodeForm && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value)}
            placeholder="Code from orcarouter.ai"
            className="flex-1 border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCompleteCode}
            disabled={busy || !codeInput.trim()}
            className="bg-zinc-800 px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Finish
          </button>
        </div>
      )}

      {login.hint && (
        <p data-testid="orca-login-hint" className="text-[10px] text-zinc-400">
          {login.hint}
        </p>
      )}

      {login.authorizeUrl && busy && (
        <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
          <a
            href={login.authorizeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-zinc-400 underline decoration-zinc-700 hover:text-zinc-200"
          >
            Open the OrcaRouter consent page
          </a>
          <button
            type="button"
            onClick={handleCancel}
            className="shrink-0 uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      )}

      {(login.error || localError) && (
        <p role="alert" data-testid="orca-login-error" className="border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">
          {login.error?.message ?? localError}
        </p>
      )}
    </div>
  );
}
