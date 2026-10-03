"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ChevronLeft, Mic, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

// The Ask sheet (PRD, Ask about this policy agent; docs/components.md section 7, Ask box).
// Questions go to /api/ask and are never stored; answers come only from the school's policy, with sections cited.

type Citation = { document: string | null; section: string | null; quote: string };
type Contact = { name: string; office: string | null; phone: string | null; email: string | null };
type Answer = { answer: string; citations: Citation[]; refused: boolean; crisis: boolean; fallback_contact: Contact };
export type AskMessage =
  | { role: "user"; text: string }
  | { role: "answer"; data: Answer }
  | { role: "error"; text: string };

// Questions people commonly ask about a policy. They are prompts, not answers.
const STARTERS = ["If I report here, who finds out?", "Can I get support without making a formal report?", "How long does an investigation take?"];

const citeLabel = (c: Citation) =>
  [c.section ? (/^\d/.test(c.section) ? `Section ${c.section}` : c.section) : null, c.document].filter(Boolean).join(", ") || "Policy";

function Citations({ citations }: { citations: Citation[] }) {
  // One chip per document and section; tapping shows the exact clause the answer rests on.
  const groups = new Map<string, Citation[]>();
  for (const c of citations) groups.set(citeLabel(c), [...(groups.get(citeLabel(c)) ?? []), c]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {[...groups.keys()].map((label) => (
          <button key={label} type="button" aria-expanded={open === label} onClick={() => setOpen(open === label ? null : label)}
            className={cn("inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand",
              open === label ? "bg-brand-tint text-brand ring-1 ring-inset ring-brand" : "bg-brand-tint/70 text-brand hover:bg-brand-tint")}>
            {label}
          </button>
        ))}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {groups.get(open)!.map((c, i) => (
            <blockquote key={i} className="rounded-2xl bg-hairline/40 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-text">&ldquo;{c.quote}&rdquo;</blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

function AnswerMessage({ data }: { data: Answer }) {
  const c = data.fallback_contact;
  const tel = c.phone?.split(/ext/i)[0].replace(/[^\d+]/g, "");
  return (
    <div className="max-w-[92%]">
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-text">{data.answer}</p>
      {data.citations.length > 0 && <Citations citations={data.citations} />}
      {(data.refused || data.crisis) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.crisis && <a href="tel:1-800-563-0808" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-support/12 px-4 text-sm font-medium text-support"><Phone className="size-4" aria-hidden />VictimLinkBC</a>}
          {data.refused && tel && <a href={`tel:${tel}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-hairline/50 px-4 text-sm font-medium text-text"><Phone className="size-4" aria-hidden />Call {c.phone?.split(/ext/i)[0].trim()}</a>}
          <Link href="/support" prefetch={false} className="inline-flex min-h-10 items-center rounded-full bg-support/12 px-4 text-sm font-medium text-support">Get support</Link>
        </div>
      )}
    </div>
  );
}

function Typing() {
  return (
    <div role="status" aria-label="Finding the answer in the policy" className="flex h-6 items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-pulse rounded-full bg-text-secondary motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </div>
  );
}

// The Ask box: auto-growing input (up to about 200 px), mic (voice arrives in milestone 10), round send that
// is disabled until there is text. Enter sends; Shift+Enter adds a line.
function AskBox({ school, busy, onSend }: { school: string; busy: boolean; onSend: (q: string) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
  }, [value]);
  const send = () => {
    const q = value.trim();
    if (q.length < 3 || busy) return;
    onSend(q);
    setValue("");
  };
  const ready = value.trim().length >= 3 && !busy;
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(); }}
      className="flex cursor-text items-end gap-1.5 rounded-[26px] bg-surface p-1.5 ring-1 ring-inset ring-hairline focus-within:ring-2 focus-within:ring-brand/60"
      onClick={() => ref.current?.focus()}>
      <label htmlFor="ask-input" className="sr-only">Your question about {school}&apos;s policy</label>
      <textarea id="ask-input" ref={ref} rows={1} value={value} maxLength={500}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
        placeholder={`Ask about ${school}'s policy`}
        className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-text placeholder:text-text-secondary focus:outline-none" />
      <button type="button" disabled aria-label="Ask by voice (coming soon)" title="Ask by voice (coming soon)"
        className="grid size-10 shrink-0 place-items-center rounded-full text-text-secondary disabled:opacity-50">
        <Mic className="size-5" strokeWidth={1.75} aria-hidden />
      </button>
      <button type="submit" disabled={!ready} aria-label="Send" title="Send"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-on-brand transition-[background-color,opacity] hover:bg-brand-hover active:scale-95 disabled:bg-hairline disabled:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <ArrowUp className="size-5" strokeWidth={2.25} aria-hidden />
      </button>
    </form>
  );
}

export function AskView({ slug, school, messages, setMessages, onBack, scrollRef }: {
  slug: string; school: string; messages: AskMessage[];
  setMessages: React.Dispatch<React.SetStateAction<AskMessage[]>>; onBack: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages, busy]);

  const ask = async (question: string) => {
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, question }) });
      const json = (await res.json().catch(() => null)) as (Answer & { error?: string }) | null;
      if (!res.ok || !json || json.error) setMessages((m) => [...m, { role: "error", text: json?.error ?? "That didn't go through. Try again in a moment." }]);
      else setMessages((m) => [...m, { role: "answer", data: json }]);
    } catch {
      setMessages((m) => [...m, { role: "error", text: "You seem to be offline. Try again when you're connected." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-3 pt-3 md:pt-4">
        <button type="button" onClick={onBack} aria-label={`Back to ${school}`}
          className="grid size-9 place-items-center rounded-full bg-hairline/70 text-text-secondary transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-brand">
          <ChevronLeft className="size-5" strokeWidth={2} aria-hidden />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-semibold leading-tight text-text">Ask about this policy</h2>
          <p className="truncate text-[13px] text-text-secondary">{school}</p>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5" aria-live="polite">
        {messages.length === 0 ? (
          <div className="pb-6 pt-2">
            <p className="text-[15px] leading-relaxed text-text">Answers come only from {school}&apos;s policy, with the section cited.</p>
            <div className="mt-4 flex flex-col items-start gap-2">
              {STARTERS.map((q) => (
                <button key={q} type="button" disabled={busy} onClick={() => ask(q)}
                  className="min-h-10 rounded-full bg-hairline/45 px-4 text-left text-sm text-text transition-colors hover:bg-hairline focus-visible:outline-2 focus-visible:outline-brand">
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="space-y-5 pb-4 pt-1">
            {messages.map((m, i) => (
              <li key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <p className="max-w-[85%] whitespace-pre-line rounded-[20px] rounded-br-md bg-brand-tint px-4 py-2.5 text-[15px] leading-relaxed text-text">{m.text}</p>
                ) : m.role === "error" ? (
                  <p role="alert" className="text-sm text-big-gap">{m.text}</p>
                ) : (
                  <AnswerMessage data={m.data} />
                )}
              </li>
            ))}
            {busy && <li><Typing /></li>}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 px-3 pb-3 pt-2">
        <AskBox school={school} busy={busy} onSend={ask} />
        <p className="mt-2 px-2 text-center text-[12px] leading-snug text-text-secondary">
          Please don&apos;t share personal details. Questions aren&apos;t stored. <Link href="/privacy" prefetch={false} className="text-brand underline-offset-2 hover:underline">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
