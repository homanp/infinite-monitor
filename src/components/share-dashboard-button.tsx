"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWidgetStore } from "@/store/widget-store";
import { flushSyncToServer } from "@/lib/sync-db";

interface ShareInfo {
  dashboardId: string;
  shareId: string;
  shareUrl: string;
  sessionStreamId: string;
  updatedAt: string;
}

function formatLiveStatus(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "Live sync ready";
  }

  return `Synced ${date.toLocaleString()}`;
}

export function ShareDashboardButton() {
  const dashboards = useWidgetStore((state) => state.dashboards);
  const activeDashboardId = useWidgetStore((state) => state.activeDashboardId);

  const activeDashboard = useMemo(
    () => dashboards.find((dashboard) => dashboard.id === activeDashboardId) ?? null,
    [dashboards, activeDashboardId],
  );

  const [open, setOpen] = useState(false);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    setShareInfo(null);
    setError(null);
    setCopied(false);
  }, [activeDashboardId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const loadShareInfo = useCallback(async (dashboardId: string) => {
    setLoading(true);
    setError(null);

    try {
      await flushSyncToServer();

      const response = await fetch(`/api/dashboards/${dashboardId}/share`, {
        method: "POST",
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? `Share link failed with status ${response.status}`);
      }

      setShareInfo(data as ShareInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = useCallback(async () => {
    if (!activeDashboard) {
      return;
    }

    const nextOpen = !open;
    setOpen(nextOpen);

    if (nextOpen && !loading) {
      await loadShareInfo(activeDashboard.id);
    }
  }, [activeDashboard, loadShareInfo, loading, open]);

  const handleCopy = useCallback(async () => {
    if (!shareInfo) {
      return;
    }

    await navigator.clipboard.writeText(shareInfo.shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [shareInfo]);

  const handleOpenShare = useCallback(() => {
    if (!shareInfo) {
      return;
    }

    window.open(shareInfo.shareUrl, "_blank", "noopener,noreferrer");
  }, [shareInfo]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        size="sm"
        onClick={() => { void handleToggle(); }}
        disabled={!activeDashboard}
        className="gap-1.5 border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 uppercase tracking-wider text-xs"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </Button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-[340px] border border-zinc-700 bg-zinc-800 p-3 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                Live Share
              </div>
              <div className="mt-1 truncate text-sm text-zinc-100">
                {activeDashboard?.title ?? "Dashboard"}
              </div>
            </div>
            <div className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Live sync
            </div>
          </div>

            <div className="mt-3 border border-zinc-700 bg-zinc-900/60 p-2">
            {loading ? (
              <div className="text-xs text-zinc-500">Syncing live share…</div>
            ) : shareInfo ? (
              <>
                <div className="break-all text-xs text-zinc-300">{shareInfo.shareUrl}</div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  {formatLiveStatus(shareInfo.updatedAt)}
                </div>
              </>
            ) : (
              <div className="text-xs text-zinc-500">
                Share link unavailable.
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={!shareInfo || loading}
              onClick={() => { void handleCopy(); }}
              className="flex-1 justify-center border border-zinc-700 bg-zinc-900/40 text-zinc-200 hover:bg-zinc-700"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy Link"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!shareInfo || loading}
              onClick={handleOpenShare}
              className="flex-1 justify-center border border-zinc-700 bg-zinc-900/40 text-zinc-200 hover:bg-zinc-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
