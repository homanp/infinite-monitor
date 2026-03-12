"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWidgetStore } from "@/store/widget-store";
import { syncWidgetToDb } from "@/lib/sync-db";

export function CreateWidgetDialog() {
  const addWidget = useWidgetStore((s) => s.addWidget);
  const setActiveWidget = useWidgetStore((s) => s.setActiveWidget);

  return (
    <Button
      size="sm"
      className="gap-1.5 border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
      onClick={() => {
        const id = addWidget();
        setActiveWidget(id);
        const widget = useWidgetStore.getState().widgets.find((w) => w.id === id);
        if (widget) syncWidgetToDb(widget);
      }}
    >
      <Plus className="h-4 w-4" />
      Add Widget
    </Button>
  );
}
