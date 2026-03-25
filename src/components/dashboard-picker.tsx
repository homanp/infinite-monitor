"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Plus, Pencil, Check, Trash2, LayoutDashboard, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useWidgetStore } from "@/store/widget-store";
import { scheduleSyncToServer } from "@/lib/sync-db";

export function DashboardPicker({ currentShareTitle }: { currentShareTitle?: string } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const isOnSharePage = pathname.startsWith("/share/");

  const dashboards = useWidgetStore((s) => s.dashboards);
  const activeDashboardId = useWidgetStore((s) => s.activeDashboardId);
  const savedShares = useWidgetStore((s) => s.savedShares);
  const removeShare = useWidgetStore((s) => s.removeShare);
  const addDashboard = useWidgetStore((s) => s.addDashboard);
  const renameDashboard = useWidgetStore((s) => s.renameDashboard);
  const removeDashboard = useWidgetStore((s) => s.removeDashboard);
  const setActiveDashboard = useWidgetStore((s) => s.setActiveDashboard);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  const activeDashboard = dashboards.find((d) => d.id === activeDashboardId);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
        setCreatingNew(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (creatingNew && newInputRef.current) {
      newInputRef.current.focus();
    }
  }, [creatingNew]);

  const handleSelect = useCallback((id: string) => {
    setActiveDashboard(id);
    setOpen(false);
    setEditingId(null);
    setCreatingNew(false);
    scheduleSyncToServer({ dirtyDashboardIds: [id] });
    if (isOnSharePage) router.push("/");
  }, [setActiveDashboard, isOnSharePage, router]);

  const handleStartEdit = useCallback((e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditValue(title);
  }, []);

  const handleFinishEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      renameDashboard(editingId, editValue.trim());
      scheduleSyncToServer({ dirtyDashboardIds: [editingId] });
    }
    setEditingId(null);
  }, [editingId, editValue, renameDashboard]);

  const handleCreateNew = useCallback(() => {
    const name = newName.trim() || "Dashboard";
    const id = addDashboard(name);
    setActiveDashboard(id);
    setCreatingNew(false);
    setNewName("");
    scheduleSyncToServer({ dirtyDashboardIds: [id] });
    if (isOnSharePage) router.push("/");
  }, [newName, addDashboard, setActiveDashboard, isOnSharePage, router]);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const dashboard = dashboards.find((d) => d.id === id);
    const widgetIds = dashboard?.widgetIds ?? [];
    removeDashboard(id);

    // Delete widgets and dashboard from the server DB
    for (const wid of widgetIds) {
      fetch("/api/widgets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: wid }),
      }).catch(() => {});
    }
    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dashboards: useWidgetStore.getState().dashboards.map((d) => ({
          id: d.id, title: d.title, widgetIds: d.widgetIds, createdAt: d.createdAt,
        })),
        widgets: useWidgetStore.getState().widgets.map((w) => ({
          id: w.id, title: w.title, description: w.description, code: w.code,
          layout: w.layout, messages: w.messages,
        })),
      }),
    }).catch(() => {});
  }, [removeDashboard, dashboards]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        size="sm"
        onClick={() => setOpen(!open)}
        className={cn(
          "gap-1.5 border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 uppercase tracking-wider text-xs",
          open && "bg-zinc-700"
        )}
      >
        <LayoutDashboard className="h-4 w-4" />
        <span className="max-w-[140px] truncate">
          {isOnSharePage ? (currentShareTitle ?? "Shared") : (activeDashboard?.title ?? "Dashboard")}
        </span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </Button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-[220px] border border-zinc-700 bg-zinc-800 shadow-xl">
          <div className="py-1">
            {dashboards.map((d) => (
              <div
                key={d.id}
                onClick={() => editingId !== d.id && handleSelect(d.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-wider cursor-pointer transition-colors",
                  d.id === activeDashboardId
                    ? "text-zinc-100 bg-zinc-700/50"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30"
                )}
              >
                {editingId === d.id ? (
                  <form
                    className="flex-1 flex items-center gap-1"
                    onSubmit={(e) => { e.preventDefault(); handleFinishEdit(); }}
                  >
                    <Input
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleFinishEdit}
                      className="h-6 text-xs bg-zinc-900 border-zinc-600 px-1.5 py-0"
                    />
                    <button type="submit" className="text-teal-400 hover:text-teal-300 shrink-0">
                      <Check className="h-3 w-3" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 truncate">{d.title}</span>
                    <button
                      onClick={(e) => handleStartEdit(e, d.id, d.title)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 shrink-0"
                      style={{ opacity: d.id === activeDashboardId ? 0.6 : 0 }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = d.id === activeDashboardId ? "0.6" : "0"; }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {dashboards.length > 1 && (
                      <button
                        onClick={(e) => handleDelete(e, d.id)}
                        className="text-zinc-500 hover:text-red-400 shrink-0"
                        style={{ opacity: 0 }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {savedShares.length > 0 && (
            <div className="border-t border-zinc-700 py-1">
              {savedShares.map((share) => (
                <div
                  key={share.shareId}
                  onClick={() => { setOpen(false); router.push(`/share/${share.shareId}`); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-wider cursor-pointer transition-colors",
                    isOnSharePage && pathname === `/share/${share.shareId}`
                      ? "text-zinc-100 bg-zinc-700/50"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30"
                  )}
                >
                  <Share2 className="h-3 w-3 shrink-0 text-zinc-500" />
                  <span className="flex-1 truncate">{share.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeShare(share.shareId); }}
                    className="text-zinc-500 hover:text-red-400 shrink-0"
                    style={{ opacity: 0 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-zinc-700">
            {creatingNew ? (
              <form
                className="flex items-center gap-1.5 px-3 py-2"
                onSubmit={(e) => { e.preventDefault(); handleCreateNew(); }}
              >
                <Input
                  ref={newInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Dashboard name…"
                  className="h-6 text-xs bg-zinc-900 border-zinc-600 px-1.5 py-0 flex-1"
                />
                <button type="submit" className="text-teal-400 hover:text-teal-300 shrink-0">
                  <Check className="h-3 w-3" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreatingNew(true)}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-xs uppercase tracking-wider text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/30 transition-colors"
              >
                <Plus className="h-3 w-3" />
                New Dashboard
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
