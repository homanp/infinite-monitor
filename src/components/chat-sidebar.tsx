"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { MessageSquareDashed, X } from "lucide-react";
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
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWidgetStore } from "@/store/widget-store";

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
    <Reasoning isStreaming={isStreaming} defaultOpen={false} className="w-full mb-0!">
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
      <ReasoningContent>{text}</ReasoningContent>
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
  messages: Array<{ id: string; role: "user" | "assistant"; content: string; reasoning?: string }>;
  isStreaming: boolean;
  isReasoningStreaming: boolean;
  streamingMsgId: string | null;
  activeAction: string | null;
}) {
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
          {/* Show assistant message only once text starts arriving */}
          {(msg.role === "user" || msg.content) && (
            <Message from={msg.role}>
              <MessageContent>
                <MessageResponse>{msg.content}</MessageResponse>
              </MessageContent>
            </Message>
          )}
        </Fragment>
      ))}
      {activeAction && (
        <div className="pl-0.5 max-w-full overflow-hidden">
          <Shimmer className="text-xs truncate block max-w-full" duration={1.5}>
            {activeAction.length > 60 ? activeAction.slice(0, 60) + "…" : activeAction}
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
  messages: Array<{ role: "user" | "assistant"; content: string }>
) {
  const {
    addMessage,
    setWidgetFile,
    setStreaming,
    setCurrentAction,
    appendReasoningToMessage,
    setReasoningStreaming,
  } = useWidgetStore.getState();

  setStreaming(widgetId, true);
  const assistantMsgId = nanoid();
  addMessage(widgetId, { id: assistantMsgId, role: "assistant", content: "" });

  try {
    const controller = new AbortController();
    abortControllers.set(widgetId, controller);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      updateAssistantMessage(widgetId, assistantMsgId, `Error: ${err}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let fullText = "";
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
            setReasoningStreaming(widgetId, true);
            appendReasoningToMessage(widgetId, assistantMsgId, event.text);
          } else if (event.type === "text-delta") {
            setReasoningStreaming(widgetId, false);
            fullText += event.text;
            updateAssistantMessage(widgetId, assistantMsgId, fullText);
          } else if (event.type === "write-file") {
            // Agent wrote a file → persist to store → WidgetPreview writes to WC
            if (event.path && event.content != null) {
              setWidgetFile(widgetId, event.path, event.content);
              setCurrentAction(widgetId, `Writing ${event.path}`);
            }
          } else if (event.type === "run-command") {
            // Agent wants to run a command — execute in WebContainer
            const cmd = [event.command, ...(event.args ?? [])].join(" ");
            setCurrentAction(widgetId, `Running ${cmd.slice(0, 50)}`);
            // Fire-and-forget: import WC and run (can't await here without blocking stream)
            import("@/lib/webcontainer").then(({ runCommand }) => {
              runCommand(event.command, event.args ?? []).catch(console.error);
            });
          } else if (event.type === "tool-call") {
            let action = "";
            if (event.toolName === "writeFile") {
              action = `Writing ${event.args?.path}`;
            } else if (event.toolName === "readFile") {
              action = `Reading ${event.args?.path}`;
            } else if (event.toolName === "web_search") {
              action = event.args?.query
                ? `Searching "${event.args.query}"`
                : "Searching the web";
            }
            if (action) setCurrentAction(widgetId, action);
          } else if (event.type === "error") {
            updateAssistantMessage(
              widgetId,
              assistantMsgId,
              `Error: ${event.error}`
            );
          }
        } catch {
          // skip malformed chunks
        }
      }
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      updateAssistantMessage(
        widgetId,
        assistantMsgId,
        `Error: ${String(err)}`
      );
    }
  } finally {
    abortControllers.delete(widgetId);
    setCurrentAction(widgetId, null);
    setReasoningStreaming(widgetId, false);
    setStreaming(widgetId, false);
  }
}

export function ChatSidebar() {
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
  const inputRef = useRef(input);
  inputRef.current = input;

  const prevWidgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevWidgetIdRef.current === activeWidgetId) return;
    if (prevWidgetIdRef.current) {
      draftInputs.set(prevWidgetIdRef.current, inputRef.current);
    }
    setInput(activeWidgetId ? (draftInputs.get(activeWidgetId) ?? "") : "");
    prevWidgetIdRef.current = activeWidgetId;
  }, [activeWidgetId]);

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
    if (!activeWidget || !input.trim() || isActiveStreaming) return;

    const widgetId = activeWidget.id;
    const userContent = input.trim();
    setInput("");
    draftInputs.delete(widgetId);

    const currentWidget = useWidgetStore
      .getState()
      .widgets.find((w) => w.id === widgetId);
    if (!currentWidget) return;

    const isFirstUserMessage = !currentWidget.messages.some(
      (m) => m.role === "user"
    );

    const messagesForApi = [
      ...currentWidget.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userContent },
    ];

    addMessage(widgetId, { id: nanoid(), role: "user", content: userContent });

    if (isFirstUserMessage) {
      fetch("/api/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userContent }),
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.title) renameWidget(widgetId, data.title);
        })
        .catch(() => {});
    }

    streamToWidget(widgetId, messagesForApi);
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
        className="flex h-full w-md flex-col border-l border-zinc-700 bg-black"
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
          <input
            type="text"
            value={activeWidget?.title ?? ""}
            onChange={(e) => {
              if (activeWidget) renameWidget(activeWidget.id, e.target.value);
            }}
            className="min-w-0 flex-1 bg-transparent text-xs font-medium uppercase tracking-wider text-zinc-100 outline-none placeholder:text-zinc-500"
            placeholder="Widget name…"
          />
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

        <div className="p-3">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the component you want to build…"
              disabled={isActiveStreaming}
            />
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-zinc-600">
                {isActiveStreaming ? (
                  <span className="flex items-center gap-2">
                    <KittLoader />
                    <span className="text-zinc-400">esc to interrupt</span>
                  </span>
                ) : (
                  "Enter to send · Shift+Enter for newline"
                )}
              </span>
              <PromptInputSubmit
                disabled={!input.trim() || !activeWidget || isActiveStreaming}
              />
            </div>
          </PromptInput>
        </div>
      </aside>
    </div>
  );
}
