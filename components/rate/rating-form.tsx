"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type Answers = {
  knows_how?: boolean; trust?: number; went_through?: "yes" | "no" | "prefer_not";
  believed?: number; informed?: number; time_bucket?: string; consequence?: string;
};
type Mode = "rate" | "already" | "edit" | "done" | "edited" | "withdrawn";

// Choices are fixed; there is no free text anywhere in the form.
const TIME = [
  { value: "under_1m", label: "Under 1 month" },
  { value: "1_3m", label: "1 to 3 months" },
  { value: "3_6m", label: "3 to 6 months" },
  { value: "6m_plus_or_waiting", label: "6 months or more, or still waiting" },
];
const CONSEQUENCE = [
  { value: "yes", label: "Yes" }, { value: "no", label: "No" },
  { value: "still_waiting", label: "Still waiting" }, { value: "prefer_not", label: "Prefer not to say" },
];

const choiceCls = (on: boolean) => cn(
  "min-h-11 rounded-full px-4 py-2.5 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
  on ? "bg-brand-tint font-medium text-brand ring-1 ring-brand/40" : "bg-hairline/45 text-text hover:bg-hairline"
);

function Question({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    // A labelled group rather than <fieldset>: a fieldset draws its top border through the legend.
    <div role="group" aria-labelledby={id} className="border-t border-hairline py-5 first:border-t-0">
      <p id={id} className="mb-3 text-[17px] font-medium text-text">{label}</p>
      {children}
    </div>
  );
}

function Choices<T extends string | boolean>({ name, value, options, onChange }: {
  name: string; value: T | undefined; options: { value: T; label: string }[]; onChange: (v: T | undefined) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby={name} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value}
          onClick={() => onChange(value === o.value ? undefined : o.value)} className={choiceCls(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Scale({ name, value, onChange }: { name: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <div role="radiogroup" aria-labelledby={name} className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}${n === 1 ? ", not at all" : n === 5 ? ", completely" : ""}`}
            onClick={() => onChange(value === n ? undefined : n)} className={cn(choiceCls(value === n), "px-0 tabular-nums")}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-text-secondary" aria-hidden>
        <span>Not at all</span><span>Completely</span>
      </div>
    </div>
  );
}

function CodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-hairline/40 px-5 py-4">
      <span className="font-mono text-3xl tracking-[0.18em] text-text">{code}</span>
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(code).catch(() => {}); setCopied(true); }}
        className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-sm font-medium text-text shadow-sm hover:bg-raised">
        {copied ? <Check className="size-4 text-brand" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function RatingForm({ slug, schoolName, alreadyRated }: { slug: string; schoolName: string; alreadyRated: boolean }) {
  const [mode, setMode] = useState<Mode>(alreadyRated ? "already" : "rate");
  const [a, setA] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [editCode, setEditCode] = useState("");

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((p) => {
    const n = { ...p, [k]: v };
    // Step 2 only exists for people who went through the process.
    if (k === "went_through" && v !== "yes") { delete n.believed; delete n.informed; delete n.time_bucket; delete n.consequence; }
    return n;
  });
  const step2 = a.went_through === "yes";

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
    if (mode === "edit") {
      if ((await send("PATCH", { code: editCode, answers: a })).ok) setMode("edited");
      return;
    }
    const r = await send("POST", { slug, answers: a });
    if (r.ok && r.code) { setCode(r.code); setMode("done"); window.scrollTo({ top: 0 }); }
    else if (r.status === 409) setMode("already");
  };

  if (mode === "done") {
    return (
      <section className="mt-6 space-y-5" aria-live="polite">
        <p className="text-[17px] text-text">Thank you. Your rating is saved, with no link to your account.</p>
        <CodeBox code={code} />
        <p className="text-[15px] leading-relaxed text-text">Save this code. It&apos;s the only way to change or withdraw your rating, and we can&apos;t recover it.</p>
        <Link href={`/map/${slug}`} className="inline-block rounded-full bg-brand px-5 py-3 text-[15px] font-medium text-on-brand hover:bg-brand-hover">Back to {schoolName}</Link>
      </section>
    );
  }
  if (mode === "edited" || mode === "withdrawn") {
    return (
      <section className="mt-6 space-y-5" aria-live="polite">
        <p className="text-[17px] text-text">{mode === "edited" ? "Your rating is updated." : "Your rating is withdrawn. It no longer counts."}</p>
        <Link href={`/map/${slug}`} className="inline-block rounded-full bg-brand px-5 py-3 text-[15px] font-medium text-on-brand hover:bg-brand-hover">Back to {schoolName}</Link>
      </section>
    );
  }
  if (mode === "already") {
    return (
      <section className="mt-6 space-y-4">
        <p className="text-[17px] text-text">You&apos;ve already rated {schoolName}. Use your code to change or withdraw it.</p>
        <div>
          <label htmlFor="edit-code" className="mb-2 block text-sm text-text">Your code</label>
          <input id="edit-code" value={editCode} onChange={(e) => setEditCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            autoComplete="off" spellCheck={false} placeholder="8 letters and numbers"
            className="w-full rounded-full border border-hairline bg-surface px-4 py-3 font-mono text-lg tracking-[0.18em] text-text placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-text-secondary/80 focus:border-brand focus:outline-none" />
        </div>
        {error && <p role="alert" className="text-sm text-big-gap">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={editCode.length !== 8} onClick={() => { setError(null); setMode("edit"); }}
            className="rounded-full bg-brand px-5 py-3 text-[15px] font-medium text-on-brand hover:bg-brand-hover disabled:opacity-50">Change my answers</button>
          <button type="button" disabled={editCode.length !== 8 || busy}
            onClick={async () => { if ((await send("PATCH", { code: editCode, withdraw: true })).ok) setMode("withdrawn"); }}
            className="rounded-full bg-hairline/60 px-5 py-3 text-[15px] font-medium text-text hover:bg-hairline disabled:opacity-50">Withdraw my rating</button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4" noValidate>
      <p className="mb-1 text-sm text-text-secondary" aria-live="polite">{step2 ? "2 of 2" : "1 of 2"}</p>
      <div>
      <Question id="q-knows" label="Do you know how to report here?">
        <Choices name="q-knows" value={a.knows_how} onChange={(v) => set("knows_how", v)} options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} />
      </Question>
      <Question id="q-trust" label="Would you trust the process?">
        <Scale name="q-trust" value={a.trust} onChange={(v) => set("trust", v)} />
      </Question>
      <Question id="q-went" label="Have you been through your school's reporting process?">
        <Choices name="q-went" value={a.went_through} onChange={(v) => set("went_through", v)}
          options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "prefer_not", label: "Prefer not to say" }]} />
      </Question>
      {step2 && (
        <>
          <Question id="q-believed" label="Did you feel believed?">
            <Scale name="q-believed" value={a.believed} onChange={(v) => set("believed", v)} />
          </Question>
          <Question id="q-informed" label="Were you kept informed?">
            <Scale name="q-informed" value={a.informed} onChange={(v) => set("informed", v)} />
          </Question>
          <Question id="q-time" label="How long until there was an outcome?">
            <Choices name="q-time" value={a.time_bucket} onChange={(v) => set("time_bucket", v)} options={TIME} />
          </Question>
          <Question id="q-consequence" label="Was there a consequence?">
            <Choices name="q-consequence" value={a.consequence} onChange={(v) => set("consequence", v)} options={CONSEQUENCE} />
          </Question>
        </>
      )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-big-gap">{error}</p>}
      <div className="mt-4 border-t border-hairline pt-5">
        <button type="submit" disabled={busy} className="w-full rounded-full bg-brand px-5 py-3.5 text-[15px] font-medium text-on-brand hover:bg-brand-hover disabled:opacity-50 sm:w-auto">
          {busy ? "Saving" : mode === "edit" ? "Save my changes" : "Submit my rating"}
        </button>
        <p className="mt-3 text-xs text-text-secondary">Your answers are stored with no link to your account. <Link href="/privacy" prefetch={false} className="text-brand underline-offset-2 hover:underline">Privacy</Link></p>
      </div>
    </form>
  );
}
