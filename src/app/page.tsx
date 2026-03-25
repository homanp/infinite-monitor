"use client";

import { DashboardGrid } from "@/components/dashboard-grid";
import { ChatSidebar } from "@/components/chat-sidebar";
import { AddMenu } from "@/components/add-menu";
import { DashboardPicker } from "@/components/dashboard-picker";
import { ShareDashboardButton } from "@/components/share-dashboard-button";
import { AppHeader } from "@/components/app-header";

export default function Home() {
  return (
    <div className="flex h-screen overflow-hidden bg-zinc-900">
      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader>
          <DashboardPicker />
          <ShareDashboardButton />
          <AddMenu />
        </AppHeader>
        <DashboardGrid />
      </div>
      <ChatSidebar />
    </div>
  );
}
