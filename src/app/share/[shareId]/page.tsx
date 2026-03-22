import { SharedDashboardView } from "@/components/shared-dashboard-view";
import { lookupPublishedDashboardSnapshot } from "@/lib/publish-dashboard";

function UnpublishedShareState({ shareId }: { shareId: string }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-900">
      <header className="border-b border-zinc-800 px-5 py-3">
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          Shared Dashboard
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md border border-zinc-800 bg-zinc-900/60 p-6 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Snapshot Unavailable
          </div>
          <h1 className="mt-2 text-sm uppercase tracking-[0.18em] text-zinc-100">
            This dashboard has not been published yet.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            Ask the author to publish or republish this dashboard. Until then,
            the share link stays stable but does not expose private draft state.
          </p>
          <div className="mt-4 break-all text-[11px] uppercase tracking-[0.16em] text-zinc-600">
            {shareId}
          </div>
        </div>
      </div>
    </div>
  );
}

function BackendUnavailableShareState({
  shareId,
  message,
}: {
  shareId: string;
  message: string;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-900">
      <header className="border-b border-zinc-800 px-5 py-3">
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          Shared Dashboard
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md border border-zinc-800 bg-zinc-900/60 p-6 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Share Backend Unavailable
          </div>
          <h1 className="mt-2 text-sm uppercase tracking-[0.18em] text-zinc-100">
            This share link cannot be loaded right now.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            The published snapshot service is unavailable or not configured for
            this deployment.
          </p>
          <div className="mt-4 break-words text-xs text-zinc-500">{message}</div>
          <div className="mt-4 break-all text-[11px] uppercase tracking-[0.16em] text-zinc-600">
            {shareId}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const result = await lookupPublishedDashboardSnapshot(shareId);

  if (result.status === "unpublished") {
    return <UnpublishedShareState shareId={shareId} />;
  }

  if (result.status === "backend_unavailable") {
    return (
      <BackendUnavailableShareState
        shareId={shareId}
        message={result.message}
      />
    );
  }

  return <SharedDashboardView snapshot={result.snapshot} />;
}
