"use client";

import { Plus, LayoutGrid, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWidgetStore } from "@/store/widget-store";
import { scheduleSyncToServer } from "@/lib/sync-db";

export function AddMenu() {
  const addWidget = useWidgetStore((s) => s.addWidget);
  const setActiveWidget = useWidgetStore((s) => s.setActiveWidget);
  const addTextBlock = useWidgetStore((s) => s.addTextBlock);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            className="gap-1.5 border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 uppercase tracking-wider text-xs"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={() => {
            const id = addWidget();
            setActiveWidget(id);
            scheduleSyncToServer();
          }}
          className="gap-2 cursor-pointer text-xs uppercase tracking-wider"
        >
          <LayoutGrid className="h-4 w-4" />
          Widget
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            addTextBlock();
            scheduleSyncToServer();
          }}
          className="gap-2 cursor-pointer text-xs uppercase tracking-wider"
        >
          <Type className="h-4 w-4" />
          Text
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
