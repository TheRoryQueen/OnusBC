"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

type Answers = {
  knows_how?: boolean; trust?: number; went_through?: "yes" | "no" | "prefer_not";
  believed?: number; informed?: number; time_bucket?: string; consequence?: string;
};
type Mode = "rate" | "already" | "edit" | "done" | "edited" | "withdrawn";

// Choices are fixed; there is no free text anywhere in the form. Every question can be left blank.
const TIME = [
  { value: "under_1m", label: "Under 1 month" },
  { value: "1_3m", label: "1 to 3 months" },
  { value: "3_6m", label: "3 to 6 months" },
  { value: "6m_plus_or_waiting", label: "6 months or more, or still waiting" },
];
// Stored values stay as they are in the database; scoring: yes 4, no 0, the other two count as no answer.
const ACTION = [
  { value: "yes", label: "Yes" }, { value: "no", label: "No" },
  { value: "still_waiting", label: "Still in progress" }, { value: "prefer_not", label: "Prefer not to say" },
];

const capsule = (on: boolean) => cn(
  "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-5 text-[15px] transition-[background-color,box-shadow,color] duration-150 motion-reduce:transition-none",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.98]",
  on ? "bg-brand-tint font-medium text-brand ring-2 ring-inset ring-brand" : "bg-surface text-text ring-1 ring-inset ring-hairline hover:ring-text-secondary/40"
);

function Question({ id, label, answered, onClear, children }: {
  id: string; label: string; answered: boolean; onClear: () => void; children: React.ReactNode;
}) {
  return (
    // A labelled group rather than <fieldset>: a fieldset draws its top border through the legend.
    <div role="group" aria-labelledby={id} className="border-t border-hairline py-7 first:border-t-0 first:pt-2">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <p id={id} className="text-[17px] font-medium leading-snug text-text">{label}</p>
        <button type="button" onClick={onClear} tabIndex={answered ? 0 : -1} aria-hidden={!answered}
          className={cn("shrink-0 text-sm text-text-secondary underline-offset-4 hover:text-text hover:underline", !answered && "invisible")}>
          Clear
        </button>
      </div>
      {children}
    </div>
  );
}

function Choices<T extends string | boolean>({ name, value, options, onChange }: {
  name: string; value: T | undefined; options: { value: T; label: string }[]; onChange: (v: T | undefined) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={name} className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on}
            onClick={() => onChange(on ? undefined : o.value)} className={capsule(on)}>
            {on && <Check className="size-4" strokeWidth={2.25} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Scale({ name, value, onChange }: { name: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <div role="radiogroup" aria-labelledby={name} className="grid grid-cols-5 gap-2.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}${n === 1 ? ", not at all" : n === 5 ? ", completely" : ""}`}
            onClick={() => onChange(value === n ? undefined : n)} className={cn(capsule(value === n), "px-0 tabular-nums")}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex justify-between px-1 text-[13px] text-text-secondary" aria-hidden>
        <span>Not at all</span><span>Completely</span>
      </div>
    </div>
  );
}

function CodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[24px] bg-surface px-5 py-4 ring-1 ring-inset ring-hairline">
      <span className="font-mono text-3xl tracking-[0.18em] text-text">{code}</span>
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(code).catch(() => {}); setCopied(true); }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-page px-4 text-sm font-medium text-text ring-1 ring-inset ring-hairline hover:ring-text-secondary/40">
        {copied ? <Check className="size-4 text-brand" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const primary = "inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-[15px] font-medium text-on-brand transition-colors hover:bg-brand-hover active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function RatingForm({ slug, schoolName, alreadyRated }: { slug: string; schoolName: string; alreadyRated: boolean }) {
  const [mode, setMode] = useState<Mode>(alreadyRated ? "already" : "rate");
  const [a, setA] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [editCode, setEditCode] = useState("");
  const step2Ref = useRef<HTMLDivElement>(null);

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((p) => {
    const n = { ...p, [k]: v };
    if (v === undefined) delete n[k];
    // Step 2 only exists for people who went through the process.
    if (k === "went_through" && v !== "yes") { delete n.believed; delete n.informed; delete n.time_bucket; delete n.consequence; }
    return n;
  });
  const step2 = a.went_through === "yes";
  const answered = Object.keys(a).length > 0;

  // Opening step 2 brings its first question into view (no animation with reduced motion).
  const opened = useRef(false);
  useEffect(() => {
    if (step2 && !opened.current) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      step2Ref.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
    opened.current = step2;
  }, [step2]);

  const send = async (method: "POST" | "PATCH", body: unknown) => {
    setBusy(true); setError(null);
    const res = await fetch("/api/ratings", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Your rating didn't save. Try again in a moment."); return { ok: false as const, status: res.status }; }
    return { ok: true as const, status: res.status, ...json };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answered) return;
    // submit_rating stores the gate's "Prefer not to say" as no answer (null).
    const answers = a;
    if (mode === "edit") {
      if ((await send("PATCH", { code: editCode, answers })).ok) setMode("edited");
      return;
    }
    const r = await send("POST", { slug, answers });
    if (r.ok && r.code) { setCode(r.code); setMode("done"); window.scrollTo({ top: 0 }); }
    else if (r.status === 409) setMode("already");
  };

  const backLink = <Link href={`/map/${slug}`} className={primary}>Back to {schoolName}</Link>;

  if (mode === "done") {
    return (
      <section className="mt-8 space-y-6" aria-live="polite">
        <p className="text-[17px] leading-relaxed text-text">Thank you. Your rating is saved, with no link to your account.</p>
        <CodeBox code={code} />
        <p className="text-[15px] leading-relaxed text-text">Save this code. It&apos;s the only way to change or withdraw your rating, and we can&apos;t recover it.</p>
        {backLink}
      </section>
    );
  }
  if (mode === "edited" || mode === "withdrawn") {
    return (
      <section className="mt-8 space-y-6" aria-live="polite">
        <p className="text-[17px] text-text">{mode === "edited" ? "Your rating is updated." : "Your rating is withdrawn. It no longer counts."}</p>
        {backLink}
      </section>
    );
  }
  if (mode === "already") {
    return (
      <section className="mt-8 space-y-5">
        <p className="text-[17px] leading-relaxed text-text">You&apos;ve already rated {schoolName}. Use your code to change or withdraw it.</p>
        <div>
          <label htmlFor="edit-code" className="mb-2 block text-sm text-text">Your code</label>
          <input id="edit-code" value={editCode} onChange={(e) => setEditCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            autoComplete="off" spellCheck={false} placeholder="8 letters and numbers"
            className="min-h-12 w-full rounded-full bg-surface px-5 font-mono text-lg tracking-[0.18em] text-text ring-1 ring-inset ring-hairline placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        {error && <p role="alert" className="text-sm text-big-gap">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={editCode.length !== 8} onClick={() => { setError(null); setMode("edit"); }} className={primary}>Change my answers</button>
          <button type="button" disabled={editCode.length !== 8 || busy}
            onClick={async () => { if ((await send("PATCH", { code: editCode, withdraw: true })).ok) setMode("withdrawn"); }}
            className="inline-flex min-h-12 items-center rounded-full bg-surface px-6 text-[15px] font-medium text-text ring-1 ring-inset ring-hairline hover:ring-text-secondary/40 disabled:opacity-40">
            Withdraw my rating
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6" noValidate>
      <p className="text-sm tabular-nums text-text-secondary" aria-live="polite">{step2 ? "2 of 2" : "1 of 2"}</p>

      <div className="mt-4">
        <Question id="q-knows" label="Do you know how to report here?" answered={a.knows_how !== undefined} onClear={() => set("knows_how", undefined)}>
          <Choices name="q-knows" value={a.knows_how} onChange={(v) => set("knows_how", v)} options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} />
        </Question>
        <Question id="q-trust" label="Would you trust the process?" answered={a.trust !== undefined} onClear={() => set("trust", undefined)}>
          <Scale name="q-trust" value={a.trust} onChange={(v) => set("trust", v)} />
        </Question>
        <Question id="q-went" label="Have you been through your school's reporting process?" answered={a.went_through !== undefined} onClear={() => set("went_through", undefined)}>
          <Choices name="q-went" value={a.went_through} onChange={(v) => set("went_through", v)}
            options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "prefer_not", label: "Prefer not to say" }]} />
        </Question>
      </div>

      {step2 && (
        <div ref={step2Ref} className="mt-6 scroll-mt-24 animate-in fade-in duration-300 motion-reduce:animate-none">
          <h2 className="text-xl font-semibold tracking-tight text-text">About your report</h2>
          <p className="mt-1 text-sm text-text-secondary">Only answer what you&apos;re comfortable with.</p>
          <div className="mt-4">
            <Question id="q-believed" label="Did you feel believed?" answered={a.believed !== undefined} onClear={() => set("believed", undefined)}>
              <Scale name="q-believed" value={a.believed} onChange={(v) => set("believed", v)} />
            </Question>
            <Question id="q-informed" label="Were you kept informed?" answered={a.informed !== undefined} onClear={() => set("informed", undefined)}>
              <Scale name="q-informed" value={a.informed} onChange={(v) => set("informed", v)} />
            </Question>
            <Question id="q-time" label="How long until there was an outcome?" answered={a.time_bucket !== undefined} onClear={() => set("time_bucket", undefined)}>
              <Choices name="q-time" value={a.time_bucket} onChange={(v) => set("time_bucket", v)} options={TIME} />
            </Question>
            <Question id="q-action" label="Did the school take any action after your report?" answered={a.consequence !== undefined} onClear={() => set("consequence", undefined)}>
              <Choices name="q-action" value={a.consequence} onChange={(v) => set("consequence", v)} options={ACTION} />
            </Question>
          </div>
        </div>
      )}

      <p className="mt-4 border-t border-hairline pt-6 text-[13px] leading-relaxed text-text-secondary">
        Your answers are stored with no link to your account. <Link href="/privacy" prefetch={false} className="text-brand underline-offset-2 hover:underline">Privacy</Link>
      </p>

      {/* Floating bar: Get help and the one submit button stay in reach the whole way down. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="glass pointer-events-auto mx-auto flex max-w-xl items-center justify-between gap-3 rounded-full p-1.5 pl-5">
          <Link href="/support" prefetch={false} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-support underline-offset-4 hover:underline">
            <LifeBuoy className="size-4" aria-hidden />Get help
          </Link>
          <div className="flex items-center gap-3">
            {error && <p role="alert" className="hidden text-sm text-big-gap sm:block">{error}</p>}
            <button type="submit" disabled={busy || !answered} className={primary}>
              {busy ? "Saving" : mode === "edit" ? "Save my changes" : "Submit my rating"}
            </button>
          </div>
        </div>
        {error && <p role="alert" className="glass pointer-events-auto mx-auto mt-2 max-w-xl rounded-full px-5 py-2 text-sm text-big-gap sm:hidden">{error}</p>}
      </div>
    </form>
  );
}
