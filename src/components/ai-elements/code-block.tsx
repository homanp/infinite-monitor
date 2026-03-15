"use client";

import { Check, Copy, Download, FileCode2 } from "lucide-react";
import { codeToTokens, type TokensResult } from "shiki";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export function CodeBlock({
  code,
  language,
  className,
  children,
}: {
  code: string;
  language: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "my-4 w-full min-w-0 max-w-full overflow-hidden border border-zinc-800 bg-black text-zinc-100",
        className
      )}
      data-language={language}
    >
      {children}
    </div>
  );
}

export function CodeBlockHeader({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CodeBlockTitle({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2 text-zinc-400", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CodeBlockFilename({
  className,
  children,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      className={cn("truncate font-mono text-[11px] lowercase", className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function CodeBlockActions({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 items-center gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function ActionButton({
  className,
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function CodeBlockCopyButton({
  code,
  className,
  ...props
}: { code: string } & Omit<ComponentProps<"button">, "children">) {
  const [copied, setCopied] = useState(false);

  return (
    <ActionButton
      aria-label="Copy code"
      className={className}
      title="Copy code"
      onClick={async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
      {...props}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </ActionButton>
  );
}

export function CodeBlockDownloadButton({
  code,
  language,
  className,
  ...props
}: {
  code: string;
  language: string;
} & Omit<ComponentProps<"button">, "children">) {
  return (
    <ActionButton
      aria-label="Download code"
      className={className}
      title="Download code"
      onClick={() => {
        const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `snippet.${language || "txt"}`;
        link.click();
        URL.revokeObjectURL(url);
      }}
      {...props}
    >
      <Download className="size-4" />
    </ActionButton>
  );
}

export function CodeBlockContent({
  code,
  language,
  className,
}: {
  code: string;
  language: string;
  className?: string;
}) {
  const plainCode = useMemo(() => code.replace(/\n$/, ""), [code]);
  const plainLines = useMemo(() => plainCode.split("\n"), [plainCode]);
  const [tokensResult, setTokensResult] = useState<TokensResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const result = await codeToTokens(plainCode, {
          lang: (language || "text") as import("shiki").BundledLanguage,
          theme: "github-dark",
        });

        if (!cancelled) {
          setTokensResult(result);
        }
      } catch {
        if (!cancelled) {
          setTokensResult(null);
        }
      }
    }

    void highlight();

    return () => {
      cancelled = true;
    };
  }, [plainCode, language]);

  return (
    <div className={cn("w-full min-w-0 max-w-full overflow-x-auto", className)}>
      {tokensResult ? (
        <pre
          className="w-max min-w-full bg-transparent pr-2 py-3 pl-3 text-xs leading-6"
          style={{ color: tokensResult.fg ?? "#e4e4e7" }}
        >
          <code className="font-mono text-xs">
            {tokensResult.tokens.map((line, index) => (
              <div key={index} className="font-mono whitespace-pre">
                <span className="min-w-0 font-mono whitespace-pre">
                  {line.length ? (
                    line.map((token, tokenIndex) => (
                      <span
                        key={tokenIndex}
                        style={{
                          color: token.color,
                          backgroundColor: token.bgColor,
                          fontStyle:
                            token.fontStyle === 1 ? "italic" : undefined,
                          fontWeight:
                            token.fontStyle === 2 ? "bold" : undefined,
                          textDecoration:
                            token.fontStyle === 4 ? "underline" : undefined,
                          ...(token.htmlStyle ?? {}),
                        }}
                        {...token.htmlAttrs}
                      >
                        {token.content}
                      </span>
                    ))
                  ) : (
                    " "
                  )}
                </span>
              </div>
            ))}
          </code>
        </pre>
      ) : (
        <pre className="w-max min-w-full bg-transparent pr-2 py-3 pl-3 text-xs leading-6 text-zinc-100">
          <code>
            {plainLines.map((line, index) => (
              <div key={index} className="font-mono whitespace-pre">
                <span className="whitespace-pre">{line || " "}</span>
              </div>
            ))}
          </code>
        </pre>
      )}
    </div>
  );
}

export function DefaultCodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language: string;
  className?: string;
}) {
  return (
    <CodeBlock code={code} language={language} className={className}>
      <CodeBlockHeader>
        <CodeBlockTitle>
          <FileCode2 className="size-3.5 shrink-0" />
          <CodeBlockFilename>{language || "text"}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockDownloadButton code={code} language={language} />
          <CodeBlockCopyButton code={code} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent code={code} language={language} />
    </CodeBlock>
  );
}
