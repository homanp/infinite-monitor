"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  bootWidget,
  updateWidgetFiles,
  getPreviewUrl,
  getStatus,
  onStatusChange,
  type WCStatus,
} from "@/lib/webcontainer";
import { useWidgetStore } from "@/store/widget-store";

const STATUS_LABEL: Record<WCStatus, string> = {
  idle: "Waiting…",
  booting: "Booting WebContainer…",
  installing: "Installing packages…",
  starting: "Starting dev server…",
  ready: "Ready",
  error: "Error",
};

interface WidgetPreviewProps {
  widgetId: string;
  files: Record<string, string>;
  isBuilding: boolean;
}

export function WidgetPreview({ widgetId, files, isBuilding }: WidgetPreviewProps) {
  const setPreviewUrl = useWidgetStore((s) => s.setPreviewUrl);
  const previewUrl = useWidgetStore((s) =>
    s.widgets.find((w) => w.id === widgetId)?.previewUrl ?? null
  );

  const [wcStatus, setWcStatus] = useState<WCStatus>(getStatus);
  const [iframeKey, setIframeKey] = useState(0);

  // Track which widget is currently loaded in WC
  const loadedWidgetRef = useRef<string | null>(null);
  const prevFilesRef = useRef<Record<string, string> | null>(null);

  // Subscribe to WC status changes
  useEffect(() => {
    const unsub = onStatusChange((s) => {
      setWcStatus(s);
      if (s === "ready") {
        const url = getPreviewUrl();
        if (url) {
          setPreviewUrl(widgetId, url);
          setIframeKey((k) => k + 1);
        }
      }
    });
    return unsub;
  }, [widgetId, setPreviewUrl]);

  // Boot or hot-reload when files change
  useEffect(() => {
    if (!files || Object.keys(files).length === 0) return;

    // Same widget, files changed → hot reload (just update FS, HMR does the rest)
    if (
      loadedWidgetRef.current === widgetId &&
      prevFilesRef.current !== null
    ) {
      updateWidgetFiles(files).catch(console.error);
      prevFilesRef.current = files;
      return;
    }

    // Different widget or first load → full boot
    loadedWidgetRef.current = widgetId;
    prevFilesRef.current = files;

    bootWidget(files, (url) => {
      setPreviewUrl(widgetId, url);
      setIframeKey((k) => k + 1);
    }).catch(console.error);
  }, [widgetId, files, setPreviewUrl]);

  // When an already-booted preview URL exists (e.g. page reload), show it
  if (previewUrl && wcStatus === "ready") {
    return (
      <div className="relative w-full h-full">
        <iframe
          key={iframeKey}
          src={previewUrl}
          className="absolute inset-0 w-full h-full border-0"
          allow="cross-origin-isolated"
          title="Widget Preview"
          crossOrigin="anonymous"
        />
      </div>
    );
  }

  // Show loading state with status
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <Loader2 className="size-4 animate-spin text-zinc-500" />
      <p className="text-[10px] text-zinc-500">{STATUS_LABEL[wcStatus]}</p>
    </div>
  );
}
