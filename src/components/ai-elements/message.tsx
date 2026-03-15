"use client";

import { memo, type ComponentProps } from "react";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { FileText } from "lucide-react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "@/store/widget-store";
import { StreamdownBlock } from "./streamdown-block";
import { streamdownComponents } from "./streamdown-components";

const streamdownPlugins = { cjk, code, math, mermaid };
const shikiTheme: [string, string] = ["github-dark", "github-dark"];

export function Message({
  className,
  from,
  ...props
}: ComponentProps<"div"> & {
  from: "user" | "assistant";
}) {
  return (
    <div
      data-from={from}
      className={cn(
        "group flex w-full flex-col gap-2",
        "data-[from=user]:ml-auto data-[from=user]:max-w-[92%] data-[from=user]:items-end",
        "data-[from=assistant]:items-start",
        className
      )}
      {...props}
    />
  );
}

export function MessageContent({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "min-w-0 max-w-full text-xs",
        "group-data-[from=user]:overflow-hidden group-data-[from=user]:bg-zinc-800 group-data-[from=user]:px-4 group-data-[from=user]:py-3 group-data-[from=user]:text-zinc-100",
        "group-data-[from=assistant]:w-full group-data-[from=assistant]:overflow-x-hidden group-data-[from=assistant]:text-zinc-200",
        className
      )}
      {...props}
    />
  );
}

export const MessageResponse = memo(function MessageResponse({
  className,
  ...props
}: ComponentProps<typeof Streamdown>) {
  return (
    <Streamdown
      className={cn(
        "min-w-0 max-w-none text-xs leading-5 text-zinc-200 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:break-all",
        className
      )}
      BlockComponent={StreamdownBlock}
      components={streamdownComponents}
      controls={{ code: false, table: false }}
      plugins={streamdownPlugins}
      // @ts-expect-error streamdown ThemeInput type mismatch
      shikiTheme={shikiTheme}
      {...props}
    />
  );
});

export function MessageAttachments({
  attachments,
  className,
}: {
  attachments: MessageAttachment[];
  className?: string;
}) {
  if (!attachments.length) return null;

  const images = attachments.filter((a) => a.type.startsWith("image/"));
  const files = attachments.filter((a) => !a.type.startsWith("image/"));

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {images.map((img, i) => (
        <img
          key={i}
          src={img.url}
          alt={img.name}
          className="h-16 w-auto max-w-[120px] object-cover border border-zinc-700"
        />
      ))}
      {files.map((file, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400"
        >
          <FileText className="size-3 shrink-0" />
          <span className="truncate max-w-[100px]">{file.name}</span>
        </span>
      ))}
    </div>
  );
}
