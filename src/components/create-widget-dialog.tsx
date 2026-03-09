"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWidgetStore } from "@/store/widget-store";

export function CreateWidgetDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const addWidget = useWidgetStore((s) => s.addWidget);

  function handleCreate() {
    if (!title.trim()) return;
    addWidget(title.trim(), description.trim());
    setTitle("");
    setDescription("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            className="gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
          />
        }
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Add Widget</span>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md rounded-none">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Create Widget</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="widget-title" className="text-xs text-zinc-400 uppercase tracking-wider">
              Title
            </label>
            <Input
              id="widget-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Live Weather Map"
              className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="widget-desc" className="text-xs text-zinc-400 uppercase tracking-wider">
              Description
            </label>
            <Textarea
              id="widget-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this widget should display..."
              rows={3}
              className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 resize-none"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 rounded-none">
          <DialogClose
            render={
              <Button variant="ghost" className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800" />
            }
          >
            Cancel
          </DialogClose>
          <Button
            onClick={handleCreate}
            disabled={!title.trim()}
            className="bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-40"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
