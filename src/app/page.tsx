"use client";

import { DashboardGrid } from "@/components/dashboard-grid";
import { CreateWidgetDialog } from "@/components/create-widget-dialog";

export default function Home() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950">
      <header className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-300">
            Infinite Monitor
          </h1>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
        <CreateWidgetDialog />
      </header>
      <DashboardGrid />
    </div>
  );
}
