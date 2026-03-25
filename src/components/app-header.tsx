"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ScrambleText } from "@/components/scramble-text";

function useGitHubStars() {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    fetch("https://api.github.com/repos/homanp/infinite-monitor")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.stargazers_count != null) setStars(data.stargazers_count);
      })
      .catch(() => {});
  }, []);
  return stars;
}

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const stars = useGitHubStars();
  const infiniteLen = "Infinite".length;

  return (
    <header className="flex items-center justify-between gap-4 px-5 py-3">
      <h1 className="min-w-0 shrink-0 text-sm font-medium uppercase tracking-[0.2em]">
        <ScrambleText
          text="InfiniteMonitor"
          charClassName={(i) =>
            i < infiniteLen ? "text-zinc-600" : "text-zinc-300"
          }
        />
      </h1>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <a
          href="https://github.com/homanp/infinite-monitor"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({
            size: "sm",
            className:
              "gap-1.5 border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 uppercase tracking-wider !text-xs",
          })}
        >
          <Star className="h-3.5 w-3.5" />
          GitHub
          {stars !== null && (
            <>
              <span className="text-zinc-600">·</span>
              <span>{stars.toLocaleString()}</span>
            </>
          )}
        </a>
        {children}
      </div>
    </header>
  );
}
