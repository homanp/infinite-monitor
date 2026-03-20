"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { MessageSquareDashed, Pencil, X, Cable, Server, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageAttachments,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputFileUpload,
} from "@/components/ai-elements/prompt-input";
import {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorContent,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorLogo,
  ModelSelectorName,
} from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWidgetStore, type WidgetMessage, type MessageAttachment } from "@/store/widget-store";
import { useSettingsStore } from "@/store/settings-store";
import { SearchProviderPicker } from "@/components/search-provider-picker";
import { McpConfigDialog } from "@/components/mcp-config-dialog";
import { CustomApiDialog } from "@/components/custom-api-dialog";
import {
  PROVIDERS,
  parseModelString,
  createCustomProviderInfo,
  isCustomProvider,
  CUSTOM_PROVIDER_PREFIX,
} from "@/lib/model-registry";
import { Switch } from "@/components/ui/switch";

interface PendingFile {
  id: string;
  file: File;
  dataUrl: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const KITT_COUNT = 6;

function KittLoader() {
  const [pos, setPos] = useState(0);
  const dirRef = useRef(1);

  useEffect(() => {
    const id = setInterval(() => {
      setPos((prev) => {
        const next = prev + dirRef.current;
        if (next >= KITT_COUNT - 1) dirRef.current = -1;
        if (next <= 0) dirRef.current = 1;
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: KITT_COUNT }, (_, i) => {
        const dist = Math.abs(i - pos);
        const opacity = dist === 0 ? 1 : dist === 1 ? 0.4 : 0.1;
        return (
          <span
            key={i}
            className="inline-block size-1.5 bg-zinc-300 transition-opacity duration-75"
            style={{ opacity }}
          />
        );
      })}
    </span>
  );
}

const abortControllers = new Map<string, AbortController>();

function ReasoningBlock({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  return (
    <Reasoning isStreaming={isStreaming} className="w-full mb-0!">
      <ReasoningTrigger
        className="[&>svg:first-child]:hidden"
        getThinkingMessage={(streaming, duration) =>
          streaming || duration === 0 ? (
            <Shimmer duration={1}>Thinking...</Shimmer>
          ) : duration === undefined ? (
            <span>Thought for a few seconds</span>
          ) : (
            <span>Thought for {duration}s</span>
          )
        }
      />
      <ReasoningContent className="pr-2">
        {text}
      </ReasoningContent>
    </Reasoning>
  );
}

function ConversationMessages({
  messages,
  isStreaming,
  isReasoningStreaming,
  streamingMsgId,
  activeAction,
}: {
  messages: WidgetMessage[];
  isStreaming: boolean;
  isReasoningStreaming: boolean;
  streamingMsgId: string | null;
  activeAction: string | null;
}) {
  const showPlanningNextMoves = isStreaming && !activeAction;

  return (
    <>
      {messages.map((msg) => (
        <Fragment key={msg.id}>
          {msg.role === "assistant" && msg.reasoning && (
            <ReasoningBlock
              text={msg.reasoning}
              isStreaming={isReasoningStreaming && msg.id === streamingMsgId}
            />
          )}
          {(msg.role === "user" || msg.content) && (
            <Message from={msg.role}>
              {msg.attachments && msg.attachments.length > 0 && (
                <MessageAttachments attachments={msg.attachments} />
              )}
              <MessageContent>
                <MessageResponse>{msg.content}</MessageResponse>
              </MessageContent>
            </Message>
          )}
        </Fragment>
      ))}
      {(activeAction || showPlanningNextMoves) && (
        <div className="pl-0.5 max-w-full overflow-hidden">
          <Shimmer className="text-xs truncate block max-w-full" duration={1.5}>
            {(() => {
              const label = activeAction ?? "Planning next moves";
              return label.length > 60 ? label.slice(0, 60) + "…" : label;
            })()}
          </Shimmer>
        </div>
      )}
    </>
  );
}
const draftInputs = new Map<string, string>();

function updateAssistantMessage(
  widgetId: string,
  messageId: string,
  content: string
) {
  useWidgetStore.setState((state) => ({
    widgets: state.widgets.map((w) =>
      w.id === widgetId
        ? {
            ...w,
            messages: w.messages.map((m) =>
              m.id === messageId ? { ...m, content } : m
            ),
          }
        : w
    ),
  }));
}

async function streamToWidget(
  widgetId: string,
  messages: Array<{ role: "user" | "assistant"; content: string | Record<string, unknown>[] }>,
  model?: string,
  apiKey?: string,
  customApi?: { id: string; name: string; endpoint: string; type: "anthropic" | "openai"; apiKey?: string; models: Array<{ id: string; name: string }>; enabled: boolean },
) {
  const {
    addMessage,
    setWidgetCode,
    setWidgetFile,
    bumpIframeVersion,
    setStreaming,
    setCurrentAction,
    appendReasoningToMessage,
    setReasoningStreaming,
  } = useWidgetStore.getState();

  setStreaming(widgetId, true);

  let currentMsgId = nanoid();
  addMessage(widgetId, { id: currentMsgId, role: "assistant", content: "" });

  let fullText = "";
  let hasEmittedText = false;
  let activeActionStartedAt = 0;
  let activeActionVersion = 0;
  let pendingActionClear: ReturnType<typeof setTimeout> | null = null;
  const MIN_ACTION_VISIBLE_MS = 700;

  function showAction(action: string) {
    activeActionVersion += 1;
    activeActionStartedAt = Date.now();
    if (pendingActionClear) {
      clearTimeout(pendingActionClear);
      pendingActionClear = null;
    }
    setCurrentAction(widgetId, action);
  }

  function clearActionWithMinimumVisibility() {
    const versionAtSchedule = activeActionVersion;
    const elapsed = activeActionStartedAt ? Date.now() - activeActionStartedAt : MIN_ACTION_VISIBLE_MS;
    const delay = Math.max(0, MIN_ACTION_VISIBLE_MS - elapsed);

    if (pendingActionClear) {
      clearTimeout(pendingActionClear);
    }

    pendingActionClear = setTimeout(() => {
      pendingActionClear = null;
      if (activeActionVersion !== versionAtSchedule) return;
      setCurrentAction(widgetId, null);
    }, delay);
  }

  function startNewAssistantMessage() {
    currentMsgId = nanoid();
    fullText = "";
    hasEmittedText = false;
    addMessage(widgetId, { id: currentMsgId, role: "assistant", content: "" });
  }

  try {
    const controller = new AbortController();
    abortControllers.set(widgetId, controller);

    const { searchProvider, apiKeys: allKeys, mcpServers } = useSettingsStore.getState();
    const searchApiKey = searchProvider ? allKeys[searchProvider] : undefined;

    const enabledMcpServers = mcpServers
      .filter((s) => s.enabled)
      .map((s) => ({
        name: s.name,
        type: s.type,
        url: s.url,
        command: s.command,
        args: s.args,
        headers: s.headers,
        env: s.env,
      }));

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        widgetId,
        model,
        apiKey,
        ...(searchProvider && searchApiKey ? { searchProvider, searchApiKey } : {}),
        ...(enabledMcpServers.length > 0 ? { mcpServers: enabledMcpServers } : {}),
        ...(customApi ? { customApi } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      updateAssistantMessage(widgetId, currentMsgId, `Error: ${err}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;

        try {
          const event = JSON.parse(payload);
          if (event.type === "reasoning-delta") {
            if (hasEmittedText) {
              startNewAssistantMessage();
            }
            setReasoningStreaming(widgetId, true);
            appendReasoningToMessage(widgetId, currentMsgId, event.text);
          } else if (event.type === "text-delta") {
            setReasoningStreaming(widgetId, false);
            hasEmittedText = true;
            fullText += event.text;
            updateAssistantMessage(widgetId, currentMsgId, fullText);
          } else if (event.type === "widget-file") {
            if (event.path && event.content) {
              setWidgetFile(widgetId, event.path, event.content);
            }
          } else if (event.type === "widget-code") {
            if (event.code) {
              setWidgetCode(widgetId, event.code);
              showAction("Building widget…");
              setTimeout(() => bumpIframeVersion(widgetId), 15000);
            }
          } else if (event.type === "tool-call") {
            let action = "";
            if (event.toolName === "writeFile") {
              const filePath = event.args?.path ?? "";
              action =
                filePath === "src/App.tsx"
                  ? "Writing widget code"
                  : `Writing ${filePath}`;
            } else if (event.toolName === "readFile") {
              action = `Reading ${event.args?.path ?? "file"}`;
            } else if (event.toolName === "bash") {
              const cmd = String(event.args?.command ?? "");
              action = cmd.length > 40 ? `Running: ${cmd.slice(0, 40)}…` : `Running: ${cmd}`;
            } else if (event.toolName === "listDashboardWidgets") {
              action = "Checking dashboard widgets";
            } else if (event.toolName === "readWidgetCode") {
              action = `Reading ${event.args?.targetWidgetId ?? "sibling"} code`;
            } else if (event.toolName === "web_search") {
              action = event.args?.query
                ? `Searching "${event.args.query}"`
                : "Searching the web";
            } else {
              action = `Using ${event.toolName}`;
            }
            if (action) showAction(action);
          } else if (event.type === "tool-result") {
            clearActionWithMinimumVisibility();
          } else if (event.type === "abort") {
            updateAssistantMessage(
              widgetId,
              currentMsgId,
              fullText || "[Interrupted]"
            );
          } else if (event.type === "error") {
            updateAssistantMessage(
              widgetId,
              currentMsgId,
              `Error: ${event.error}`
            );
          }
        } catch {
          // skip malformed chunks
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      updateAssistantMessage(widgetId, currentMsgId, fullText || "[Interrupted]");
    } else {
      updateAssistantMessage(widgetId, currentMsgId, `Error: ${String(err)}`);
    }
  } finally {
    abortControllers.delete(widgetId);
    if (pendingActionClear) {
      clearTimeout(pendingActionClear);
    }
    setCurrentAction(widgetId, null);
    setReasoningStreaming(widgetId, false);
    setStreaming(widgetId, false);
  }
}

function useModelSelector() {
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const setModel = useSettingsStore((s) => s.setModel);
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const customApis = useSettingsStore((s) => s.customApis);
  const toggleCustomApi = useSettingsStore((s) => s.toggleCustomApi);
  const removeCustomApi = useSettingsStore((s) => s.removeCustomApi);
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [customApiOpen, setCustomApiOpen] = useState(false);

  const { providerId, modelId } = parseModelString(selectedModel);

  const allProviders = useMemo(() => {
    const customProviders = customApis
      .filter((c) => c.enabled)
      .map((c) => createCustomProviderInfo(c));
    return [...PROVIDERS, ...customProviders];
  }, [customApis]);

  const provider = allProviders.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);

  const hasKey = isCustomProvider(providerId)
    ? !!customApis.find((c) => `${CUSTOM_PROVIDER_PREFIX}${c.id}` === providerId)?.apiKey
    : !!apiKeys[providerId];

  const handleSelect = (newModel: string) => {
    setModel(newModel);
    setOpen(false);
    const { providerId: pid } = parseModelString(newModel);
    if (isCustomProvider(pid)) {
      setShowKeyInput(false);
    } else if (!apiKeys[pid]) {
      setShowKeyInput(true);
    } else {
      setShowKeyInput(false);
    }
  };

  const handleSaveKey = () => {
    if (keyInput.trim()) {
      setApiKey(providerId, keyInput.trim());
      setKeyInput("");
      setShowKeyInput(false);
    }
  };

  const handleAddCustomApi = () => {
    setOpen(false);
    setCustomApiOpen(true);
  };

  const trigger = (
    <>
      <ModelSelector open={open} onOpenChange={setOpen}>
        <ModelSelectorTrigger className="inline-flex h-7 items-center gap-1.5 px-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer">
          {isCustomProvider(providerId) ? (
            <Server className="size-3.5 text-zinc-400" />
          ) : (
            <ModelSelectorLogo provider={providerId as "anthropic"} className="size-3.5" />
          )}
          <span>{model?.name ?? modelId}</span>
          {!hasKey && !isCustomProvider(providerId) && (
            <span className="size-1.5 rounded-full bg-yellow-500/70 shrink-0" />
          )}
        </ModelSelectorTrigger>
        <ModelSelectorContent>
          <ModelSelectorInput placeholder="Search models..." />
          <ModelSelectorList>
            <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
            {allProviders.map((p) => (
              <ModelSelectorGroup key={p.id} heading={p.name}>
                {p.models.map((m) => (
                  <ModelSelectorItem
                    key={`${p.id}:${m.id}`}
                    value={`${p.id}:${m.id} ${m.name} ${p.name}`}
                    onSelect={() => handleSelect(`${p.id}:${m.id}`)}
                    className="flex items-center gap-2"
                  >
                    {isCustomProvider(p.id) ? (
                      <Server className="size-3 text-zinc-400" />
                    ) : (
                      <ModelSelectorLogo provider={p.id as "anthropic"} />
                    )}
                    <ModelSelectorName>{m.name}</ModelSelectorName>
                  </ModelSelectorItem>
                ))}
              </ModelSelectorGroup>
            ))}
            {customApis.length > 0 && (
              <ModelSelectorGroup heading="Manage Custom APIs">
                {customApis.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs"
                  >
                    <Server className="size-3 text-zinc-500 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-zinc-300">{c.name}</span>
                    <Switch
                      checked={c.enabled}
                      onCheckedChange={() => toggleCustomApi(c.id)}
                      className="scale-75"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeCustomApi(c.id); }}
                      className="text-zinc-600 hover:text-red-400 transition-colors p-0.5"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </ModelSelectorGroup>
            )}
            <ModelSelectorGroup heading="">
              <ModelSelectorItem
                value="__add_custom_api__"
                onSelect={handleAddCustomApi}
                className="flex items-center gap-2 text-zinc-400"
              >
                <Plus className="size-3" />
                <ModelSelectorName>Add Custom API</ModelSelectorName>
              </ModelSelectorItem>
            </ModelSelectorGroup>
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelector>
      <CustomApiDialog open={customApiOpen} onOpenChange={setCustomApiOpen} />
    </>
  );

  const keyInputEl = !isCustomProvider(providerId) && (showKeyInput || !hasKey) ? (
    <div className="flex items-center gap-1.5">
      <input
        type="password"
        value={keyInput}
        onChange={(e) => setKeyInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
        placeholder={`${provider?.name ?? providerId} API key...`}
        className="flex-1 bg-zinc-900 border border-zinc-800 text-xs px-2.5 py-1.5 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
      />
      <button
        onClick={handleSaveKey}
        className="px-2.5 py-1.5 text-xs uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
      >
        Save
      </button>
    </div>
  ) : null;

  return { trigger, keyInputEl };
}

export function ChatSidebar() {
  const { trigger: modelTrigger, keyInputEl: modelKeyInput } = useModelSelector();
  const [mcpOpen, setMcpOpen] = useState(false);
  const mcpServers = useSettingsStore((s) => s.mcpServers);
  const enabledMcpCount = mcpServers.filter((s) => s.enabled).length;
  const widgets = useWidgetStore((s) => s.widgets);
  const activeWidgetId = useWidgetStore((s) => s.activeWidgetId);
  const streamingWidgetIds = useWidgetStore((s) => s.streamingWidgetIds);
  const currentActions = useWidgetStore((s) => s.currentActions);
  const reasoningStreamingIds = useWidgetStore((s) => s.reasoningStreamingIds);
  const setActiveWidget = useWidgetStore((s) => s.setActiveWidget);
  const addMessage = useWidgetStore((s) => s.addMessage);
  const renameWidget = useWidgetStore((s) => s.renameWidget);

  const activeAction = activeWidgetId ? (currentActions[activeWidgetId] ?? null) : null;
  const isReasoningStreaming = activeWidgetId ? reasoningStreamingIds.includes(activeWidgetId) : false;

  const activeWidget = useMemo(
    () => widgets.find((w) => w.id === activeWidgetId) ?? null,
    [activeWidgetId, widgets]
  );

  const isActiveStreaming = activeWidgetId
    ? streamingWidgetIds.includes(activeWidgetId)
    : false;

  const handleInterrupt = () => {
    if (!activeWidgetId) return;
    abortControllers.get(activeWidgetId)?.abort();
  };

  useEffect(() => {
    if (!isActiveStreaming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleInterrupt();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isActiveStreaming, activeWidgetId]);

  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const inputRef = useRef(input);
  useEffect(() => { inputRef.current = input; }, [input]);

  const prevWidgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevWidgetIdRef.current === activeWidgetId) return;
    if (prevWidgetIdRef.current) {
      draftInputs.set(prevWidgetIdRef.current, inputRef.current);
    }
    prevWidgetIdRef.current = activeWidgetId;
    const next = activeWidgetId ? (draftInputs.get(activeWidgetId) ?? "") : "";
    queueMicrotask(() => {
      setInput(next);
      setPendingFiles([]);
    });
  }, [activeWidgetId]);

  const handleFiles = useCallback(async (fileList: FileList) => {
    const added: PendingFile[] = [];
    for (const file of Array.from(fileList)) {
      const dataUrl = await readFileAsDataUrl(file);
      added.push({ id: nanoid(), file, dataUrl });
    }
    setPendingFiles((prev) => [...prev, ...added]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith("image/"));
      if (imageItems.length === 0) return;
      e.preventDefault();
      const added: PendingFile[] = [];
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;
        const dataUrl = await readFileAsDataUrl(file);
        added.push({ id: nanoid(), file, dataUrl });
      }
      setPendingFiles((prev) => [...prev, ...added]);
    },
    []
  );

  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await handleFiles(files);
      }
    },
    [handleFiles]
  );

  useEffect(() => {
    if (!activeWidget || activeWidget.messages.length > 0) return;
    addMessage(activeWidget.id, {
      id: nanoid(),
      role: "assistant",
      content:
        "Tell me what you want this component to do, what data it should show, and the kind of layout you'd like.",
    });
  }, [activeWidget, addMessage]);

  const isOpen = activeWidget !== null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const hasText = input.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if (!activeWidget || (!hasText && !hasFiles) || isActiveStreaming) return;

    const widgetId = activeWidget.id;
    const userContent = input.trim();
    const filesToSend = [...pendingFiles];
    setInput("");
    setPendingFiles([]);
    draftInputs.delete(widgetId);

    const currentWidget = useWidgetStore
      .getState()
      .widgets.find((w) => w.id === widgetId);
    if (!currentWidget) return;

    const isFirstUserMessage = !currentWidget.messages.some(
      (m) => m.role === "user"
    );

    let contentForApi: string | Record<string, unknown>[];
    let attachments: MessageAttachment[] | undefined;

    if (filesToSend.length > 0) {
      const parts: Record<string, unknown>[] = [];
      if (userContent) {
        parts.push({ type: "text", text: userContent });
      }
      for (const pf of filesToSend) {
        const base64 = pf.dataUrl.split(",")[1];
        if (pf.file.type.startsWith("image/")) {
          parts.push({ type: "image", image: base64, mimeType: pf.file.type });
        } else {
          parts.push({ type: "file", data: base64, mimeType: pf.file.type });
        }
      }
      contentForApi = parts;
      attachments = filesToSend.map((pf) => ({
        name: pf.file.name,
        type: pf.file.type,
        size: pf.file.size,
        url: pf.dataUrl,
      }));
    } else {
      contentForApi = userContent;
    }

    const messagesForApi = [
      ...currentWidget.messages
        .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: contentForApi },
    ];

    addMessage(widgetId, {
      id: nanoid(),
      role: "user",
      content: userContent,
      attachments,
    });

    const { selectedModel, apiKeys, customApis } = useSettingsStore.getState();
    const { providerId } = parseModelString(selectedModel);
    const byokKey = apiKeys[providerId];

    // Get custom API config if using a custom provider
    // For custom providers, the model string is "custom:api-id:model-id"
    // We need to extract the api-id from the full model string
    const customApiConfig = selectedModel.startsWith(CUSTOM_PROVIDER_PREFIX)
      ? (() => {
          const afterPrefix = selectedModel.slice(CUSTOM_PROVIDER_PREFIX.length);
          const colonIdx = afterPrefix.indexOf(":");
          const customApiId = colonIdx === -1 ? afterPrefix : afterPrefix.slice(0, colonIdx);
          return customApis.find((c) => c.id === customApiId);
        })()
      : undefined;

    if (isFirstUserMessage && userContent) {
      fetch("/api/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userContent, model: selectedModel, apiKey: byokKey }),
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.title) renameWidget(widgetId, data.title);
        })
        .catch(() => {});
    }

    streamToWidget(widgetId, messagesForApi, selectedModel, byokKey, customApiConfig);
  }

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden transition-[width] duration-300 ease-out",
        isOpen ? "w-md" : "w-0"
      )}
    >
      <aside
        aria-hidden={!isOpen}
        className="relative flex h-full w-md flex-col border-l border-zinc-800 bg-black"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-zinc-500 bg-black/80">
            <span className="text-xs text-zinc-400">Drop files here</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Pencil className="size-3 shrink-0 text-zinc-600" />
            <input
              type="text"
              value={activeWidget?.title ?? ""}
              onChange={(e) => {
                if (activeWidget) renameWidget(activeWidget.id, e.target.value);
              }}
              className="min-w-0 flex-1 bg-transparent text-xs font-medium uppercase tracking-wider text-zinc-100 outline-none placeholder:text-zinc-500"
              placeholder="Widget name…"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100"
            onClick={() => setActiveWidget(null)}
          >
            <X className="size-3.5" />
            <span className="sr-only">Close sidebar</span>
          </Button>
        </div>

        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="bg-black">
            {activeWidget && activeWidget.messages.length > 0 ? (
              <ConversationMessages
                messages={activeWidget.messages}
                isStreaming={isActiveStreaming}
                isReasoningStreaming={isReasoningStreaming}
                streamingMsgId={
                  isActiveStreaming
                    ? (activeWidget.messages.findLast((m) => m.role === "assistant")?.id ?? null)
                    : null
                }
                activeAction={activeAction}
              />
            ) : (
              <ConversationEmptyState
                icon={<MessageSquareDashed className="size-10" />}
                title="Start designing"
                description="Select a widget and describe the component you want."
              />
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="px-5 py-3 space-y-2">
          {modelKeyInput}
          <PromptInput onSubmit={handleSubmit}>
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map((pf) => (
                  <div key={pf.id} className="group/file relative">
                    {pf.file.type.startsWith("image/") ? (
                      <img
                        src={pf.dataUrl}
                        alt={pf.file.name}
                        className="h-10 w-auto max-w-[75px] object-cover border border-zinc-700"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1 border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400">
                        {pf.file.name}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(pf.id)}
                      className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center bg-zinc-700 text-zinc-300 hover:bg-zinc-600 opacity-0 group-hover/file:opacity-100 transition-opacity"
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <PromptInputTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              placeholder="Describe the component you want to build…"
              disabled={isActiveStreaming}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {!isActiveStreaming && (
                  <>
                    {modelTrigger}
                    <SearchProviderPicker disabled={isActiveStreaming} />
                    <button
                      type="button"
                      onClick={() => setMcpOpen(true)}
                      disabled={isActiveStreaming}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 px-2 text-xs transition-colors cursor-pointer",
                        enabledMcpCount > 0
                          ? "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800",
                        isActiveStreaming && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <Cable className="size-3.5" />
                      {enabledMcpCount > 0 && (
                        <span className="flex items-center justify-center min-w-[14px] h-3.5 px-0.5 text-[8px] bg-zinc-700 text-zinc-200">
                          {enabledMcpCount}
                        </span>
                      )}
                    </button>
                    <McpConfigDialog open={mcpOpen} onOpenChange={setMcpOpen} />
                  </>
                )}
                {isActiveStreaming && (
                  <span className="flex items-center gap-2 px-2 text-[9px]">
                    <KittLoader />
                    <span className="text-zinc-400">esc to interrupt</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!isActiveStreaming && (
                  <PromptInputFileUpload
                    onFiles={handleFiles}
                    disabled={isActiveStreaming}
                  />
                )}
                <PromptInputSubmit
                  disabled={(!input.trim() && pendingFiles.length === 0) || !activeWidget || isActiveStreaming}
                />
              </div>
            </div>
          </PromptInput>
        </div>
      </aside>
    </div>
  );
}
