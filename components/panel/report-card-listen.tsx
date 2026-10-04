"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Square, Volume2 } from "lucide-react";
import { reportCardText } from "@/lib/report-card";
import type { InstitutionDetail } from "@/lib/types";

// "Listen to this report card": the school's summary read aloud (built from stored data, cached audio per
// school; see /api/report-card). The same summary is readable under the button. Keyed by school in the
// panel, so switching schools starts fresh.
export function ReportCardListen({ school }: { school: InstitutionDetail }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  useEffect(() => () => { audio.current?.pause(); }, []);

  const play = () => {
    if (state === "playing" || state === "loading") { audio.current?.pause(); setState("idle"); return; }
    // A new element each time; the browser cache serves the audio after the first play.
    const a = new Audio(`/api/report-card/${school.slug}`);
    a.addEventListener("playing", () => setState("playing"));
    a.addEventListener("ended", () => setState("idle"));
    a.addEventListener("error", () => setState("error"));
    audio.current = a;
    setState("loading");
    // Called inside the tap, so phones allow the audio.
    a.play().catch(() => setState("error"));
  };

  return (
    <div className="mt-4">
      <button type="button" onClick={play} aria-pressed={state === "playing"}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-hairline/55 px-4 text-sm font-medium text-text transition-colors hover:bg-hairline">
        {state === "loading" ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          : state === "playing" ? <Square className="size-3.5 fill-current" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
        {state === "playing" ? "Stop" : state === "loading" ? "Preparing" : "Listen to this report card"}
      </button>
      {state === "error" && <p role="status" className="mt-2 text-[13px] text-text-secondary">It couldn&apos;t be read aloud just now. The summary is below.</p>}
      <details className="mt-2 px-1 text-[13px] text-text-secondary">
        <summary className="inline-flex min-h-11 cursor-pointer items-center">Read the summary</summary>
        <p className="pb-1 leading-relaxed text-text">{reportCardText(school, { spoken: false })}</p>
      </details>
    </div>
  );
}
