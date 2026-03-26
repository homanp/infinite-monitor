"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWidgetStore } from "@/store/widget-store";
import { flushSyncToServer } from "@/lib/sync-db";

export function ShareDashboardButton() {
  const activeDashboardId = useWidgetStore((s) => s.activeDashboardId);
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  if (!activeDashboardId || pathname.startsWith("/share/")) return null;

  const handleShare = async () => {
    setLoading(true);
    try {
      await flushSyncToServer({ dirtyDashboardIds: [activeDashboardId] });
      const res = await fetch(`/api/dashboards/${activeDashboardId}/share`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Share failed (${res.status})`);
      await navigator.clipboard.writeText(data.shareUrl).catch(() => {});
      window.open(data.shareUrl, "_blank");
    } catch (err) {
      console.error("Share failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" onClick={handleShare} disabled={loading}
      className="gap-1.5 border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
      Share
    </Button>
  );
}
