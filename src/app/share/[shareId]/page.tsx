"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const LiveSharedDashboardView = dynamic(
  () => import("@/components/live-shared-dashboard-view").then((m) => m.LiveSharedDashboardView),
  { ssr: false },
);

export default function SharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  return <LiveSharedDashboardView shareId={shareId} />;
}
