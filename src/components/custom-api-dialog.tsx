"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Server,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  useSettingsStore,
  type CustomApiConfig,
  type CustomApiType,
} from "@/store/settings-store";

function ApiIcon({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center size-8 bg-zinc-800 text-[10px] font-bold text-zinc-400 shrink-0 uppercase tracking-wider select-none",
        className
      )}
    >
      {text}
    </div>
  );
}

function InstalledApiRow({ config }: { config: CustomApiConfig }) {
  const toggleCustomApi = useSettingsStore((s) => s.toggleCustomApi);
  const removeCustomApi = useSettingsStore((s) => s.removeCustomApi);
  const [expanded, setExpanded] = useState(false);

  const iconText = config.name.slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        "border border-zinc-800 transition-colors",
        !config.enabled && "opacity-50"
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </button>

        <ApiIcon text={iconText} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-200 truncate">
              {config.name}
            </span>
            <span className="text-[9px] text-zinc-500 uppercase">
              ({config.type})
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 truncate font-mono pl-3.5">
            {config.endpoint}
          </div>
        </div>

        <Switch
          checked={config.enabled}
          onCheckedChange={() => toggleCustomApi(config.id)}
        />

        <button
          type="button"
          onClick={() => removeCustomApi(config.id)}
          className="text-zinc-600 hover:text-red-400 transition-colors p-1"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 px-3 py-2 space-y-1.5">
          <div className="space-y-0.5">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">
              {config.models.length} model{config.models.length !== 1 && "s"}
            </span>
            {config.models.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 py-0.5 text-[11px] text-zinc-400 font-mono"
              >
                <span className="size-1 bg-zinc-600 shrink-0 rounded-full" />
                {m.id} - {m.name}
              </div>
            ))}
          </div>

          {config.models.length === 0 && (
            <p className="text-[10px] text-zinc-500">No models configured.</p>
          )}
        </div>
      )}
    </div>
  );
}

const API_TYPE_OPTIONS: { value: CustomApiType; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
];

function CustomApiForm({
  onSave,
  onCancel,
}: {
  onSave: (config: CustomApiConfig) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [type, setType] = useState<CustomApiType>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [typeOpen, setTypeOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setTypeOpen(false);
      }
    }
    if (typeOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [typeOpen]);

  const canSave = name.trim() && endpoint.trim();

  function handleAddModel() {
    if (!modelInput.trim()) return;
    const parts = modelInput.trim().split("|");
    const id = parts[0].trim();
    const displayName = parts[1]?.trim() || id;
    if (id && !models.find((m) => m.id === id)) {
      setModels([...models, { id, name: displayName }]);
      setModelInput("");
    }
  }

  function handleRemoveModel(modelId: string) {
    setModels(models.filter((m) => m.id !== modelId));
  }

  function handleSave() {
    if (!canSave) return;
    const config: CustomApiConfig = {
      id: nanoid(),
      name: name.trim(),
      endpoint: endpoint.trim(),
      type,
      enabled: true,
      models,
      ...(apiKey.trim() && { apiKey: apiKey.trim() }),
    };
    onSave(config);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Custom API"
          autoFocus
          className="w-full bg-zinc-950 border border-zinc-800 text-xs px-2.5 py-2 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
          Endpoint URL
        </label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://api.example.com/v1"
          className="w-full bg-zinc-950 border border-zinc-800 text-xs px-2.5 py-2 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
          API Type
        </label>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setTypeOpen(!typeOpen)}
            className="w-full flex items-center justify-between bg-zinc-950 border border-zinc-800 text-xs px-2.5 py-2 text-zinc-300 hover:border-zinc-600 transition-colors"
          >
            <span>
              {API_TYPE_OPTIONS.find((o) => o.value === type)?.label}
            </span>
            <ChevronDown className="size-3 text-zinc-500" />
          </button>
          {typeOpen && (
            <div className="absolute top-full left-0 right-0 z-10 mt-0.5 border border-zinc-700 bg-zinc-900 shadow-xl">
              {API_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setType(opt.value);
                    setTypeOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-2.5 py-2 text-xs transition-colors",
                    opt.value === type
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
          API Key (optional)
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full bg-zinc-950 border border-zinc-800 text-xs px-2.5 py-2 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
          Models
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddModel())}
            placeholder="model-id|Display Name"
            className="flex-1 bg-zinc-950 border border-zinc-800 text-xs px-2.5 py-2 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
          />
          <button
            type="button"
            onClick={handleAddModel}
            className="px-2.5 py-2 text-xs border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        {models.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {models.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-zinc-800 text-zinc-300"
              >
                {m.name}
                <button
                  type="button"
                  onClick={() => handleRemoveModel(m.id)}
                  className="text-zinc-500 hover:text-red-400"
                >
                  <Trash2 className="size-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="px-3 py-1.5 text-xs bg-zinc-100 text-zinc-900 hover:bg-white transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

type DialogView = "main" | "add";

export function CustomApiDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const customApis = useSettingsStore((s) => s.customApis);
  const addCustomApi = useSettingsStore((s) => s.addCustomApi);

  const [view, setView] = useState<DialogView>("main");

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setView("main");
    }
  }

  function handleAddConfig(config: CustomApiConfig) {
    addCustomApi(config);
    setView("main");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg bg-zinc-900 border-zinc-700 text-zinc-100 !rounded-none max-h-[80vh] overflow-hidden flex flex-col"
        showCloseButton
      >
        {view === "main" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm uppercase tracking-wider text-zinc-200">
                <Server className="size-4" />
                Custom APIs
              </DialogTitle>
            </DialogHeader>

            {customApis.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-0.5">
                  Configured
                </div>
                {customApis.map((config) => (
                  <InstalledApiRow key={config.id} config={config} />
                ))}
              </div>
            )}

            <div className="flex-1 min-h-0" />

            <button
              type="button"
              onClick={() => setView("add")}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-xs border border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors shrink-0"
            >
              <Plus className="size-3.5" />
              Add custom API
            </button>
          </>
        )}

        {view === "add" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm uppercase tracking-wider text-zinc-200">
                <Server className="size-4" />
                Add Custom API
              </DialogTitle>
            </DialogHeader>
            <CustomApiForm
              onSave={handleAddConfig}
              onCancel={() => setView("main")}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
