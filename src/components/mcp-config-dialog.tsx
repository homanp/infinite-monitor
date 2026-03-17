"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  Cable,
  Plus,
  Trash2,
  RotateCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  ArrowLeft,
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
  type McpServerConfig,
  type McpTransportType,
} from "@/store/settings-store";
import { MCP_REGISTRY, type McpRegistryEntry } from "@/lib/mcp-registry";

type ServerStatus = "unknown" | "loading" | "connected" | "error";

interface ToolInfo {
  name: string;
}

interface ServerState {
  status: ServerStatus;
  tools: ToolInfo[];
  error?: string;
}

const serverStates = new Map<string, ServerState>();

function StatusDot({ status }: { status: ServerStatus }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        status === "connected" && "bg-emerald-400",
        status === "error" && "bg-red-400",
        status === "loading" && "bg-yellow-400 animate-pulse",
        status === "unknown" && "bg-zinc-600"
      )}
    />
  );
}

function useServerState(
  serverId: string
): [ServerState, (s: ServerState) => void] {
  const [state, setState] = useState<ServerState>(
    () => serverStates.get(serverId) ?? { status: "unknown", tools: [] }
  );

  const update = useCallback(
    (next: ServerState) => {
      serverStates.set(serverId, next);
      setState(next);
    },
    [serverId]
  );

  return [state, update];
}

async function fetchServerTools(
  server: McpServerConfig,
  setServerState: (s: ServerState) => void
) {
  setServerState({ status: "loading", tools: [] });
  try {
    const res = await fetch("/api/mcp/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: server.type,
        url: server.url,
        command: server.command,
        args: server.args,
        headers: server.headers,
        env: server.env,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setServerState({
        status: "connected",
        tools: (data.tools ?? []).map((name: string) => ({ name })),
      });
    } else {
      setServerState({
        status: "error",
        tools: [],
        error: data.error ?? "Connection failed",
      });
    }
  } catch (err) {
    setServerState({ status: "error", tools: [], error: String(err) });
  }
}

function ServerIcon({ text, className }: { text: string; className?: string }) {
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

function InstalledServerRow({ server }: { server: McpServerConfig }) {
  const toggleMcpServer = useSettingsStore((s) => s.toggleMcpServer);
  const removeMcpServer = useSettingsStore((s) => s.removeMcpServer);
  const [expanded, setExpanded] = useState(false);
  const [serverState, setServerState] = useServerState(server.id);

  const registryEntry = MCP_REGISTRY.find(
    (r) =>
      r.id === server.name.toLowerCase() ||
      r.name.toLowerCase() === server.name.toLowerCase()
  );
  const iconText = registryEntry?.icon ?? server.name.slice(0, 2).toUpperCase();

  const subtitle =
    server.type === "command"
      ? [server.command, ...(server.args ?? [])].join(" ")
      : server.url ?? "";

  return (
    <div
      className={cn(
        "border border-zinc-800 transition-colors",
        !server.enabled && "opacity-50"
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

        <ServerIcon text={iconText} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <StatusDot status={serverState.status} />
            <span className="text-xs text-zinc-200 truncate">
              {server.name}
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 truncate font-mono pl-3.5">
            {subtitle}
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchServerTools(server, setServerState)}
          disabled={serverState.status === "loading"}
          className="text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-40 p-1"
          title="Refresh tools"
        >
          {serverState.status === "loading" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RotateCw className="size-3" />
          )}
        </button>

        <Switch
          checked={server.enabled}
          onCheckedChange={() => toggleMcpServer(server.id)}
        />

        <button
          type="button"
          onClick={() => removeMcpServer(server.id)}
          className="text-zinc-600 hover:text-red-400 transition-colors p-1"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 px-3 py-2 space-y-1.5">
          {serverState.status === "error" && serverState.error && (
            <p className="text-[10px] text-red-400">{serverState.error}</p>
          )}

          {serverState.status === "connected" &&
            serverState.tools.length > 0 && (
              <div className="space-y-0.5">
                <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                  {serverState.tools.length} tool
                  {serverState.tools.length !== 1 && "s"}
                </span>
                {serverState.tools.map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center gap-2 py-0.5 text-[11px] text-zinc-400 font-mono"
                  >
                    <span className="size-1 bg-zinc-600 shrink-0 rounded-full" />
                    {t.name}
                  </div>
                ))}
              </div>
            )}

          {serverState.status === "connected" &&
            serverState.tools.length === 0 && (
              <p className="text-[10px] text-zinc-500">No tools discovered.</p>
            )}

          {serverState.status === "unknown" && (
            <p className="text-[10px] text-zinc-500">
              Click refresh to load tools.
            </p>
          )}

          {serverState.status === "loading" && (
            <p className="text-[10px] text-zinc-500">Connecting…</p>
          )}
        </div>
      )}
    </div>
  );
}

function RegistryCard({
  entry,
  installed,
  onInstall,
}: {
  entry: McpRegistryEntry;
  installed: boolean;
  onInstall: (entry: McpRegistryEntry) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/40 transition-colors">
      <ServerIcon text={entry.icon} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-200">{entry.name}</div>
        <div className="text-[10px] text-zinc-500 truncate">
          {entry.description}
        </div>
      </div>
      {installed ? (
        <span className="text-[9px] uppercase tracking-wider text-emerald-500 shrink-0 px-2">
          Added
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onInstall(entry)}
          className="shrink-0 px-2.5 py-1 text-[10px] uppercase tracking-wider border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
        >
          Add
        </button>
      )}
    </div>
  );
}

function InstallRegistryView({
  entry,
  onBack,
  onInstall,
}: {
  entry: McpRegistryEntry;
  onBack: () => void;
  onInstall: (server: McpServerConfig) => void;
}) {
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  const needsEnv = entry.requiresEnv && entry.requiresEnv.length > 0;
  const envFilled = !needsEnv || entry.requiresEnv!.every((e) => envValues[e.key]?.trim());

  function handleInstall() {
    const server: McpServerConfig = {
      id: nanoid(),
      name: entry.name,
      type: entry.defaultType,
      enabled: true,
    };

    if (entry.defaultType === "command") {
      server.command = entry.defaultCommand;
      server.args = entry.defaultArgs;
    } else {
      server.url = entry.defaultUrl;
    }

    if (needsEnv) {
      const env: Record<string, string> = {};
      for (const e of entry.requiresEnv!) {
        if (envValues[e.key]?.trim()) env[e.key] = envValues[e.key].trim();
      }
      server.env = env;
    }

    onInstall(server);
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft className="size-3" />
        Back
      </button>

      <div className="flex items-center gap-3">
        <ServerIcon text={entry.icon} className="size-10 text-xs" />
        <div>
          <div className="text-sm text-zinc-200 font-medium">{entry.name}</div>
          <div className="text-[11px] text-zinc-500">{entry.description}</div>
        </div>
      </div>

      <div className="space-y-1 text-[10px]">
        <div className="flex gap-2">
          <span className="text-zinc-600 uppercase tracking-wider w-14 shrink-0">
            Type
          </span>
          <span className="text-zinc-400 font-mono">
            {entry.defaultType}
          </span>
        </div>
        {entry.defaultCommand && (
          <div className="flex gap-2">
            <span className="text-zinc-600 uppercase tracking-wider w-14 shrink-0">
              Cmd
            </span>
            <span className="text-zinc-400 font-mono truncate">
              {[entry.defaultCommand, ...(entry.defaultArgs ?? [])].join(" ")}
            </span>
          </div>
        )}
        {entry.defaultUrl && (
          <div className="flex gap-2">
            <span className="text-zinc-600 uppercase tracking-wider w-14 shrink-0">
              URL
            </span>
            <span className="text-zinc-400 font-mono truncate">
              {entry.defaultUrl}
            </span>
          </div>
        )}
      </div>

      {needsEnv && (
        <div className="space-y-2">
          {entry.requiresEnv!.map((env) => (
            <div key={env.key} className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
                {env.label}
              </label>
              <input
                type="password"
                value={envValues[env.key] ?? ""}
                onChange={(e) =>
                  setEnvValues((v) => ({ ...v, [env.key]: e.target.value }))
                }
                placeholder={env.placeholder}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs px-2.5 py-2 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
              />
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={!envFilled}
        onClick={handleInstall}
        className="w-full px-3 py-2 text-xs bg-zinc-100 text-zinc-900 hover:bg-white transition-colors disabled:opacity-40 uppercase tracking-wider font-medium"
      >
        Install
      </button>
    </div>
  );
}

const TRANSPORT_OPTIONS: { value: McpTransportType; label: string }[] = [
  { value: "command", label: "command" },
  { value: "sse", label: "sse" },
  { value: "streamableHttp", label: "streamableHttp" },
];

function CustomServerForm({
  onSave,
  onCancel,
}: {
  onSave: (server: McpServerConfig) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<McpTransportType>("command");
  const [value, setValue] = useState("");
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

  const isUrl = type === "sse" || type === "streamableHttp";
  const placeholder = isUrl
    ? "https://mcp-server.example.com/sse"
    : "npx -y @modelcontextprotocol/server-example";
  const canSave = name.trim() && value.trim();

  function handleSave() {
    if (!canSave) return;
    const server: McpServerConfig = {
      id: nanoid(),
      name: name.trim(),
      type,
      enabled: true,
    };
    if (isUrl) {
      server.url = value.trim();
    } else {
      const parts = value.trim().split(/\s+/);
      server.command = parts[0];
      server.args = parts.slice(1);
    }
    onSave(server);
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
          placeholder="my-mcp-server"
          autoFocus
          className="w-full bg-zinc-950 border border-zinc-800 text-xs px-2.5 py-2 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
          Type
        </label>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setTypeOpen(!typeOpen)}
            className="w-full flex items-center justify-between bg-zinc-950 border border-zinc-800 text-xs px-2.5 py-2 text-zinc-300 hover:border-zinc-600 transition-colors"
          >
            <span className="font-mono">{type}</span>
            <ChevronDown className="size-3 text-zinc-500" />
          </button>
          {typeOpen && (
            <div className="absolute top-full left-0 right-0 z-10 mt-0.5 border border-zinc-700 bg-zinc-900 shadow-xl">
              {TRANSPORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setType(opt.value);
                    setTypeOpen(false);
                    setValue("");
                  }}
                  className={cn(
                    "w-full text-left px-2.5 py-2 text-xs font-mono transition-colors",
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
          {isUrl ? "URL" : "Command"}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder={placeholder}
          className="w-full bg-zinc-950 border border-zinc-800 text-xs px-2.5 py-2 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
        />
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

type DialogView = "main" | "custom" | "registry-install";

export function McpConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mcpServers = useSettingsStore((s) => s.mcpServers);
  const addMcpServer = useSettingsStore((s) => s.addMcpServer);

  const [view, setView] = useState<DialogView>("main");
  const [registryEntry, setRegistryEntry] = useState<McpRegistryEntry | null>(
    null
  );
  const [search, setSearch] = useState("");

  const installedNames = new Set(
    mcpServers.map((s) => s.name.toLowerCase())
  );

  const filteredRegistry = search.trim()
    ? MCP_REGISTRY.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.description.toLowerCase().includes(search.toLowerCase())
      )
    : MCP_REGISTRY;

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setView("main");
      setRegistryEntry(null);
      setSearch("");
    }
  }

  function handleInstallRegistry(entry: McpRegistryEntry) {
    if (entry.requiresEnv && entry.requiresEnv.length > 0) {
      setRegistryEntry(entry);
      setView("registry-install");
    } else {
      const server: McpServerConfig = {
        id: nanoid(),
        name: entry.name,
        type: entry.defaultType,
        enabled: true,
      };
      if (entry.defaultType === "command") {
        server.command = entry.defaultCommand;
        server.args = entry.defaultArgs;
      } else {
        server.url = entry.defaultUrl;
      }
      addMcpServer(server);
    }
  }

  function handleAddCustom(server: McpServerConfig) {
    addMcpServer(server);
    setView("main");
  }

  function handleInstallFromRegistry(server: McpServerConfig) {
    addMcpServer(server);
    setView("main");
    setRegistryEntry(null);
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
                <Cable className="size-4" />
                MCP Servers
              </DialogTitle>
            </DialogHeader>

            {mcpServers.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-0.5">
                  Installed
                </div>
                {mcpServers.map((server) => (
                  <InstalledServerRow key={server.id} server={server} />
                ))}
              </div>
            )}

            <div className="space-y-2 flex-1 min-h-0 flex flex-col">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-0.5">
                Available
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-zinc-600" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search MCP servers…"
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs pl-8 pr-2.5 py-2 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto -mx-4 px-4 space-y-0.5">
                {filteredRegistry.map((entry) => (
                  <RegistryCard
                    key={entry.id}
                    entry={entry}
                    installed={installedNames.has(entry.name.toLowerCase())}
                    onInstall={handleInstallRegistry}
                  />
                ))}
                {filteredRegistry.length === 0 && (
                  <p className="text-[10px] text-zinc-500 text-center py-4">
                    No servers match your search.
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setView("custom")}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-xs border border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors shrink-0"
            >
              <Plus className="size-3.5" />
              Add custom MCP server
            </button>
          </>
        )}

        {view === "custom" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm uppercase tracking-wider text-zinc-200">
                <Cable className="size-4" />
                Custom MCP Server
              </DialogTitle>
            </DialogHeader>
            <CustomServerForm
              onSave={handleAddCustom}
              onCancel={() => setView("main")}
            />
          </>
        )}

        {view === "registry-install" && registryEntry && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm uppercase tracking-wider text-zinc-200">
                <Cable className="size-4" />
                Install Server
              </DialogTitle>
            </DialogHeader>
            <InstallRegistryView
              entry={registryEntry}
              onBack={() => {
                setView("main");
                setRegistryEntry(null);
              }}
              onInstall={handleInstallFromRegistry}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
