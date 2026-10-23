"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_ORCA_AUTH_BASE_URL } from "@/lib/orcarouter/config";
import { OrcaLoginController } from "@/lib/orcarouter/login-controller";
import {
  createSessionStorageAdapter,
  exchangeCodeViaRoute,
} from "@/lib/orcarouter/client";
import type { ExchangedKey } from "@/lib/orcarouter/pkce";
import { useSettingsStore } from "@/store/settings-store";

// The authorization code is one-time. React may mount this page's effect more
// than once (Strict Mode in development), so the exchange is memoized per page
// load: a second mount joins the first request instead of burning the code.
let pageExchange: Promise<ExchangedKey> | null = null;

function exchangeOnce(params: { code: string; verifier: string }): Promise<ExchangedKey> {
  if (!pageExchange) pageExchange = exchangeCodeViaRoute(params);
  return pageExchange;
}

/**
 * Redirect landing page for the OrcaRouter connect flow. It validates the
 * `state` of the pending attempt, exchanges the one-time code on the auth
 * origin (via the server route) and stores the resulting durable key in the
 * project's existing BYOK store.
 */
export default function OrcaCallbackPage() {
  const [message, setMessage] = useState("Finishing the OrcaRouter connection…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new OrcaLoginController({
      storage: createSessionStorageAdapter(),
      authBase: DEFAULT_ORCA_AUTH_BASE_URL,
      callbackUrl: `${window.location.origin}/orca-callback`,
      exchange: exchangeOnce,
    });

    controller
      .completeFromCallback(window.location.search)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setFailed(true);
          setMessage(
            controller.getState().error?.message
              ?? "The OrcaRouter authorization could not be completed."
          );
          return;
        }
        useSettingsStore.getState().setOrcaRouterCredential({
          key: result.key,
          source: "pkce",
          scope: result.scope,
          userId: result.userId,
        });
        setMessage("Connected to OrcaRouter. Returning to your dashboard…");
        window.setTimeout(() => window.location.replace("/?orca=connected"), 600);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setMessage("The OrcaRouter authorization could not be completed.");
        }
      });

    return () => {
      cancelled = true;
      controller.dispose();
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black p-8">
      <div className="w-full max-w-md space-y-4 border border-zinc-800 bg-zinc-950 p-6 text-center">
        <h1 className="text-xs uppercase tracking-[0.2em] text-zinc-300">OrcaRouter</h1>
        <p role="status" className="text-sm text-zinc-400">{message}</p>
        <Link
          href="/"
          className="inline-block border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-200 hover:bg-zinc-800"
        >
          {failed ? "Back to dashboard" : "Continue"}
        </Link>
      </div>
    </main>
  );
}
