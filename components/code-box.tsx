"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// A private edit code in IBM Plex Mono with a Copy button (the rating's backup code).
export function CodeBox({ code, size = "lg" }: { code: string; size?: "lg" | "sm" }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-[24px] bg-surface ring-1 ring-inset ring-hairline", size === "lg" ? "px-5 py-4" : "px-4 py-2")}>
      <span className={cn("font-mono tracking-[0.18em] text-text", size === "lg" ? "text-3xl" : "text-xl")}>{code}</span>
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(code).catch(() => {}); setCopied(true); }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-page px-4 text-sm font-medium text-text ring-1 ring-inset ring-hairline hover:ring-text-secondary/40">
        {copied ? <Check className="size-4 text-brand" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
