import { LiveSharedDashboardView } from "@/components/live-shared-dashboard-view";

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  return <LiveSharedDashboardView shareId={shareId} />;
}
