"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWidgetStore } from "@/store/widget-store";
import { flushSyncToServer } from "@/lib/sync-db";

interface ShareInfo {
  shareId: string;
  shareUrl: string;
  updatedAt: string;
}

export function ShareDashboardButton() {
  const activeDashboardId = useWidgetStore((s) => s.activeDashboardId);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const pathname = usePathname();
  if (!activeDashboardId || pathname.startsWith("/share/")) return null;

  const handleShare = async () => {
    setLoading(true);
    setError(null);
    try {
      await flushSyncToServer({ dirtyDashboardIds: [activeDashboardId] });
      const res = await fetch(`/api/dashboards/${activeDashboardId}/share`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Share failed");
      setShareInfo(data as ShareInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareInfo) return;
    await navigator.clipboard.writeText(shareInfo.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => { setOpen((v) => !v); if (!open && !shareInfo) handleShare(); }}
        className="gap-1.5 border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
          <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Share Dashboard</div>

          {loading && (
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Generating share link…
            </div>
          )}

          {error && (
            <div className="mt-3 text-xs text-red-400">{error}</div>
          )}

          {shareInfo && !loading && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareInfo.shareUrl}
                  className="flex-1 border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={handleCopy} className="flex-1 gap-1.5 border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy Link"}
                </Button>
                <a
                  href={shareInfo.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" />Open
                </a>
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Synced {shareInfo.updatedAt.replace("T", " ").replace(".000Z", "Z")}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
