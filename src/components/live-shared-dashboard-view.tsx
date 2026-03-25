"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Eye, LoaderCircle } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { SharedDashboardView } from "@/components/shared-dashboard-view";
import { buttonVariants } from "@/components/ui/button";
import {
  applySharedSessionEvent,
  buildEmptySharedSessionSnapshot,
  SharedSessionEventV1Schema,
  type SharedSessionSnapshotV1,
} from "@/lib/share-types";
import { DashboardPicker } from "@/components/dashboard-picker";
import { useWidgetStore } from "@/store/widget-store";
import { cn } from "@/lib/utils";

interface BootstrapPayload {
  snapshot: SharedSessionSnapshotV1;
  nextOffset?: string | null;
  liveUrl?: string;
}

export function LiveSharedDashboardView({ shareId }: { shareId: string }) {
  const saveShare = useWidgetStore((s) => s.saveShare);

  const [mounted, setMounted] = useState(false);
  const [snapshot, setSnapshot] = useState<SharedSessionSnapshotV1 | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let nextOffset = "now";
    let liveUrl = "";

    const applyEvent = (raw: unknown) => {
      const candidates = Array.isArray(raw) ? raw : [raw];
      for (const c of candidates) {
        const parsed = SharedSessionEventV1Schema.safeParse(c);
        if (!parsed.success) continue;
        setSnapshot((prev) => {
          const base = prev ?? buildEmptySharedSessionSnapshot(shareId);
          return applySharedSessionEvent(base, parsed.data);
        });
        setLiveError(null);
      }
    };

    const connectLive = (url: string, offset: string) => {
      if (cancelled) return;
      liveUrl = url;
      nextOffset = offset;
      es?.close();

      es = new EventSource(`${url}?offset=${encodeURIComponent(offset)}&live=sse`);

      es.addEventListener("data", (e) => {
        try { applyEvent(JSON.parse((e as MessageEvent<string>).data)); } catch {}
      });

      es.addEventListener("control", (e) => {
        try {
          const ctrl = JSON.parse((e as MessageEvent<string>).data) as Record<string, unknown>;
          if (typeof ctrl.streamNextOffset === "string") {
            nextOffset = ctrl.streamNextOffset;
            setLiveError(null);
          }
        } catch {}
      });

      es.onerror = () => {
        if (cancelled) return;
        es?.close();
        es = null;
        setLiveError("Connection interrupted");
        if (reconnectTimer !== null) return;
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connectLive(liveUrl, nextOffset);
        }, 1500);
      };
    };

    const bootstrap = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/share/${shareId}/bootstrap`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
        if (cancelled) return;

        const payload = data as BootstrapPayload;
        setSnapshot(payload.snapshot);
        if (payload.snapshot.dashboard?.title) {
          saveShare(shareId, payload.snapshot.dashboard.title);
        }

        if (payload.liveUrl) {
          connectLive(payload.liveUrl, payload.nextOffset ?? "now");
        }
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setSnapshot(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [shareId]);

  const chipCn = buttonVariants({
    size: "sm",
    className: "gap-1.5 border border-zinc-700 bg-zinc-800 text-zinc-200 uppercase tracking-wider !text-xs pointer-events-none",
  });

  const shareTitle = snapshot?.dashboard?.title;
  const statusLabel = !mounted || loading ? "Connecting" : liveError ? "Reconnecting" : error ? "Offline" : "Live sync";
  const statusAlert = !mounted || loading || liveError || error;

  const header = (
    <AppHeader>
      <DashboardPicker currentShareTitle={shareTitle ?? "Shared"} />
      <div className={cn(chipCn, statusAlert ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100")}>
        <Eye className="h-3.5 w-3.5" />{statusLabel}
      </div>
    </AppHeader>
  );

  if (!mounted || loading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-zinc-900">
        {header}
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading…</div>
      </div>
    );
  }

  if (error || !snapshot?.dashboard) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-zinc-900">
        {header}
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-md border border-zinc-800 bg-zinc-900/60 p-6 text-center">
            <AlertTriangle className="mx-auto h-5 w-5 text-amber-300" />
            <h1 className="mt-3 text-sm uppercase tracking-[0.18em] text-zinc-100">Shared session unavailable</h1>
            {error && <div className="mt-4 break-words text-xs text-zinc-500">{error}</div>}
            <div className="mt-4 break-all text-[11px] uppercase tracking-[0.16em] text-zinc-600">{shareId}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-900">
      {header}
      <SharedDashboardView snapshot={snapshot} liveError={liveError} />
    </div>
  );
}
