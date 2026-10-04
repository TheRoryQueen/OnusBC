"use client";

import { useRef, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import type { CriterionEvent, GradeEvent, RunResult, Stage } from "@/lib/grading/events";
import { cn } from "@/lib/utils";

type SampleOption = { id: string; name: string; province: string; title: string; url: string };
const STAGES: { id: Stage; label: string }[] = [
  { id: "download", label: "Get the PDF" },
  { id: "extract", label: "Read the text" },
  { id: "grade", label: "Grade 17 criteria" },
  { id: "verify", label: "Check every quote" },
];
const timeFmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Vancouver" });

function Criterion({ c }: { c: CriterionEvent }) {
  const rejected = c.model_score > 0 && !c.verified;
  return (
    <li className="border-b border-hairline py-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[15px] text-text">{c.label}<span className="ml-2 text-[13px] text-text-secondary">{c.category}</span></p>
        <p className="shrink-0 text-[13px] tabular-nums text-text-secondary">
          {rejected ? <><s>{c.model_score} of 2</s> 0 of 2</> : `${c.score} of 2`}
        </p>
      </div>
      {c.model_score === 0 ? (
        <p className="mt-1 text-[13px] text-text-secondary">Not addressed in the policy.</p>
      ) : c.verified ? (
        <>
          <p className="mt-2 font-mono text-[12.5px] leading-relaxed text-text">
            &ldquo;<mark className="rounded-[3px] bg-brand-tint px-0.5 text-text">{c.quote}</mark>&rdquo;
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-brand">
            <Check className="size-3.5" aria-hidden />Found word for word{c.section ? `, section ${c.section}` : ""}
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 font-mono text-[12.5px] leading-relaxed text-text-secondary">
            &ldquo;<del className="decoration-big-gap decoration-2">{c.model_quote}</del>&rdquo;
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-big-gap">
            <X className="size-3.5" aria-hidden />Not found in the document ({c.reject_reason}), so it scores 0
          </p>
        </>
      )}
    </li>
  );
}

function Summary({ r, recorded }: { r: RunResult; recorded?: boolean }) {
  return (
    <div className="mt-8">
      {recorded && <p className="text-[13px] font-medium text-text-secondary">Recorded run from {timeFmt.format(new Date(r.finished_at))}</p>}
      <div className="mt-2 flex items-end gap-5">
        <p className="font-serif text-[4.5rem] leading-none text-text" aria-label={`On paper grade ${r.paper_letter}`}>{r.paper_letter}</p>
        <div className="pb-2 text-[15px] leading-relaxed text-text-secondary">
          <p><span className="text-text">{Math.round(r.paper_gpa)} of 100</span> on paper, {r.source.label}</p>
          <p>{r.quotes_checked} quotes checked: {r.quotes_verified} found word for word, {r.quotes_rejected} rejected</p>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-text-secondary">
        {r.document.pages} pages, {r.document.sections} sections. {r.gemini_calls} Gemini call ({r.model}), {(r.ms / 1000).toFixed(0)} s. Not added to the BC map. <a href={r.source.url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 underline decoration-current/35 hover:decoration-current">Open the policy</a>
      </p>
    </div>
  );
}

export function GradeRunner({ samples, runsLeft, cap, model }: { samples: SampleOption[]; runsLeft: number; cap: number; model: string }) {
  const [choice, setChoice] = useState<string>(samples[0]?.id ?? "url");
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [doc, setDoc] = useState<{ pages: number | null; chars: number; sections: number } | null>(null);
  const [criteria, setCriteria] = useState<CriterionEvent[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<{ message: string; recorded: RunResult | null } | null>(null);
  const [left, setLeft] = useState(runsLeft);
  const abort = useRef<AbortController | null>(null);

  async function run() {
    setRunning(true); setStage(null); setDoc(null); setCriteria([]); setResult(null); setError(null);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/grade", {
        method: "POST", signal: abort.current.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify(choice === "url" ? { url } : { sample: choice }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError({ message: j?.error ?? "The live run couldn't start.", recorded: null });
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const e = JSON.parse(buf.slice(0, nl)) as GradeEvent;
          buf = buf.slice(nl + 1);
          if (e.type === "stage") { setStage(e.stage); if (e.stage === "grade") setLeft((n) => Math.max(0, n - 1)); }
          else if (e.type === "document") setDoc(e);
          else if (e.type === "criterion") setCriteria((cs) => [...cs, e]);
          else if (e.type === "done") { setResult(e.result); setCriteria(e.result.criteria); }
          else if (e.type === "error") setError({ message: e.message, recorded: e.recorded });
        }
      }
    } catch {
      setError({ message: "The connection dropped before the run finished.", recorded: null });
    } finally {
      setRunning(false);
    }
  }

  const stageIndex = stage ? STAGES.findIndex((s) => s.id === stage) : -1;
  const urlValid = /^https:\/\/\S+$/.test(url.trim());
  const canRun = !running && left > 0 && (choice !== "url" || urlValid);

  return (
    <div className="mt-10">
      <fieldset disabled={running}>
        <legend className="text-[13px] text-text-secondary">Choose a policy</legend>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
          {samples.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={choice === s.id} onClick={() => setChoice(s.id)}
              className={cn("min-h-11 rounded-full px-4 text-left text-[14px] transition-colors", choice === s.id ? "bg-text text-page" : "bg-hairline/50 text-text hover:bg-hairline")}>
              {s.name} <span className={choice === s.id ? "opacity-70" : "text-text-secondary"}>({s.province})</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={choice === "url"} onClick={() => setChoice("url")}
            className={cn("min-h-11 rounded-full px-4 text-[14px] transition-colors", choice === "url" ? "bg-text text-page" : "bg-hairline/50 text-text hover:bg-hairline")}>
            Paste a PDF link
          </button>
        </div>
        {choice === "url" && (
          <div className="mt-3">
            <label htmlFor="pdf-url" className="sr-only">Link to a policy PDF</label>
            <input id="pdf-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.ca/sexual-violence-policy.pdf"
              className="min-h-11 w-full rounded-full bg-hairline/40 px-4 text-[15px] text-text placeholder:text-text-secondary/70" />
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="button" onClick={run} disabled={!canRun}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-[15px] font-medium text-page transition-opacity disabled:opacity-40">
            {running && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
            {running ? "Grading" : "Grade it live"}
          </button>
          <p className="text-[13px] text-text-secondary">{left} of {cap} live runs left today. Each run is one call to {model}.</p>
        </div>
      </fieldset>

      {(running || stage) && !error && (
        <ol className="mt-10 grid gap-2 sm:grid-cols-4" aria-label="Progress">
          {STAGES.map((s, i) => {
            const done = result ? true : i < stageIndex;
            const now = !result && i === stageIndex && running;
            return (
              <li key={s.id} className={cn("flex items-center gap-2 text-[14px]", done || now ? "text-text" : "text-text-secondary")}>
                <span className={cn("grid size-6 place-items-center rounded-full", done ? "bg-brand text-page" : "bg-hairline/60")}>
                  {done ? <Check className="size-3.5" aria-hidden /> : now ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <span className="text-[11px] tabular-nums">{i + 1}</span>}
                </span>
                {s.label}
              </li>
            );
          })}
        </ol>
      )}
      {doc && <p className="mt-4 text-[13px] text-text-secondary">{doc.pages} pages, {doc.chars.toLocaleString("en-CA")} characters, {doc.sections} sections read.</p>}

      <div aria-live="polite">
        {result && <Summary r={result} />}
        {error && (
          <div className="mt-8">
            <p role="alert" className="text-[15px] text-big-gap">{error.message}</p>
            {error.recorded && <Summary r={error.recorded} recorded />}
          </div>
        )}
      </div>

      {(error?.recorded && !criteria.length ? error.recorded.criteria : criteria).length > 0 && (
        <ul className="mt-6" aria-label="Criteria">
          {(error?.recorded && !criteria.length ? error.recorded.criteria : criteria).map((c) => <Criterion key={c.criterion_id} c={c} />)}
        </ul>
      )}
    </div>
  );
}
