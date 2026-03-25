"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Eye, LoaderCircle } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { SharedDashboardView, SharedChatSidebar } from "@/components/shared-dashboard-view";
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

export function LiveSharedDashboardView({ shareId }: { shareId: string }) {
  const saveShare = useWidgetStore((s) => s.saveShare);
  const [snapshot, setSnapshot] = useState<SharedSessionSnapshotV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let nextOffset = "now";
    let liveUrl = "";

    const applyEvent = (raw: unknown) => {
      for (const c of Array.isArray(raw) ? raw : [raw]) {
        const parsed = SharedSessionEventV1Schema.safeParse(c);
        if (parsed.success) {
          setSnapshot((prev) => applySharedSessionEvent(prev ?? buildEmptySharedSessionSnapshot(shareId), parsed.data));
          setLiveError(null);
        }
      }
    };

    const connectLive = (url: string, offset: string) => {
      if (cancelled) return;
      liveUrl = url; nextOffset = offset;
      es?.close();
      es = new EventSource(`${url}?offset=${encodeURIComponent(offset)}&live=sse`);
      es.addEventListener("data", (e) => { try { applyEvent(JSON.parse((e as MessageEvent<string>).data)); } catch {} });
      es.addEventListener("control", (e) => { try { const c = JSON.parse((e as MessageEvent<string>).data); if (typeof c.streamNextOffset === "string") { nextOffset = c.streamNextOffset; setLiveError(null); } } catch {} });
      es.onerror = () => { if (cancelled) return; es?.close(); es = null; setLiveError("Connection interrupted"); if (reconnectTimer === null) reconnectTimer = window.setTimeout(() => { reconnectTimer = null; connectLive(liveUrl, nextOffset); }, 1500); };
    };

    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`/api/share/${shareId}/bootstrap`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
        if (cancelled) return;
        setSnapshot(data.snapshot);
        if (data.snapshot.dashboard?.title) saveShare(shareId, data.snapshot.dashboard.title);
        if (data.liveUrl) connectLive(data.liveUrl, data.nextOffset ?? "now");
      } catch (err) { if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setSnapshot(null); } }
      finally { if (!cancelled) setLoading(false); }
    })();

    return () => { cancelled = true; if (reconnectTimer !== null) window.clearTimeout(reconnectTimer); es?.close(); };
  }, [shareId, saveShare]);

  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const chipCn = buttonVariants({ size: "sm", className: "gap-1.5 border border-zinc-700 bg-zinc-800 text-zinc-200 uppercase tracking-wider !text-xs pointer-events-none" });
  const ok = !loading && !liveError && !error;
  const statusLabel = loading ? "Connecting" : liveError ? "Reconnecting" : error ? "Offline" : "Live sync";
  const ready = !loading && snapshot?.dashboard;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-900">
      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader>
          <DashboardPicker currentShareTitle={snapshot?.dashboard?.title ?? "Shared"} />
          <div className={cn(chipCn, ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-amber-500/30 bg-amber-500/10 text-amber-100")}>
            <Eye className="h-3.5 w-3.5" />{statusLabel}
          </div>
        </AppHeader>
        {ready ? (
          <SharedDashboardView snapshot={snapshot} selectedWidgetId={selectedWidgetId} onSelectWidgetId={setSelectedWidgetId} />
        ) : (loading) ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading…</div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="max-w-md border border-zinc-800 bg-zinc-900/60 p-6 text-center">
              <AlertTriangle className="mx-auto h-5 w-5 text-amber-300" />
              <h1 className="mt-3 text-sm uppercase tracking-[0.18em] text-zinc-100">Shared session unavailable</h1>
              {error && <div className="mt-4 break-words text-xs text-zinc-500">{error}</div>}
            </div>
          </div>
        )}
      </div>
      {ready && <SharedChatSidebar chats={snapshot.chats ?? []} selectedWidgetId={selectedWidgetId} onClose={() => setSelectedWidgetId(null)} />}
    </div>
  );
}
