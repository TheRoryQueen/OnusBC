"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Square, Volume2 } from "lucide-react";
import { reportCardText } from "@/lib/report-card";
import type { InstitutionDetail } from "@/lib/types";

// "Listen": the school's report card read aloud (built from stored data, cached audio per school; see
// /api/report-card). The Listen button sits in the panel's action row; once it is used, a strip under the row
// shows what is happening and offers the same summary as text (the transcript, so the audio always has a
// text alternative). The panel is keyed by school, so switching schools starts fresh.
type State = "idle" | "loading" | "playing" | "done" | "error";

export function useReportCard(slug: string) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<State>("idle");
  useEffect(() => () => { audio.current?.pause(); }, []);
  const toggle = () => {
    if (state === "playing" || state === "loading") { audio.current?.pause(); setState("done"); return; }
    // A new element each time; the browser cache serves the audio after the first play.
    const a = new Audio(`/api/report-card/${slug}`);
    a.addEventListener("playing", () => setState("playing"));
    a.addEventListener("ended", () => setState("done"));
    a.addEventListener("error", () => setState("error"));
    audio.current = a;
    setState("loading");
    // Called inside the tap, so phones allow the audio.
    a.play().catch(() => setState("error"));
  };
  return { state, toggle };
}

const actionCls = "flex flex-1 flex-col items-center gap-1 rounded-2xl bg-hairline/45 px-2 py-2.5 text-xs font-medium text-text transition-colors hover:bg-hairline focus-visible:outline-2 focus-visible:outline-brand";

export function ListenAction({ state, toggle }: ReturnType<typeof useReportCard>) {
  const busy = state === "playing" || state === "loading";
  return (
    <button type="button" onClick={toggle} aria-pressed={busy} aria-label={busy ? "Stop the report card" : "Listen to this report card"} className={actionCls}>
      {state === "loading" ? <LoaderCircle className="size-[18px] animate-spin text-brand motion-reduce:animate-none" strokeWidth={1.75} aria-hidden />
        : state === "playing" ? <Square className="size-4 fill-current text-brand" strokeWidth={1.75} aria-hidden />
        : <Volume2 className="size-[18px] text-brand" strokeWidth={1.75} aria-hidden />}
      {state === "playing" ? "Stop" : state === "loading" ? "Preparing" : "Listen"}
    </button>
  );
}

export function ListenStrip({ school, state }: { school: InstitutionDetail; state: State }) {
  const [open, setOpen] = useState(false);
  if (state === "idle") return null;
  const line = { loading: "Preparing the report card.", playing: "Reading the report card aloud.", done: "Report card read aloud.", error: "It couldn't be read aloud just now." }[state];
  return (
    <div className="mt-3 rounded-2xl bg-hairline/30 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p role="status" className="text-[13px] text-text-secondary">{line}</p>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="report-card-text"
          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[13px] font-medium text-brand hover:bg-hairline/60 focus-visible:outline-2 focus-visible:outline-brand">
          {open ? "Hide the text" : "Show the text"}
        </button>
      </div>
      {open && <p id="report-card-text" className="pb-1.5 text-[14px] leading-relaxed text-text">{reportCardText(school, { spoken: false })}</p>}
    </div>
  );
}
