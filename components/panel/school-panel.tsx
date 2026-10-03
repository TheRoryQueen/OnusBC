"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NumberFlow from "@number-flow/react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight, FileQuestion, Globe, MessageCircle, Phone, PenLine, X } from "lucide-react";
import { AskView, type AskMessage } from "./ask-view";
import { Badge } from "@/components/ui/badge";
import { useMapState } from "@/components/map/map-state";
import { gapDisplay, isGraded } from "@/lib/grades";
import type { Grade, InstitutionDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Accessible", "Survivor rights", "Process", "Accountability", "Training"];
const SCORE_WORD = ["Not addressed", "Mentioned, not binding", "Explicit and binding"];

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const q = window.matchMedia("(min-width: 768px)");
    const read = () => setDesktop(q.matches);
    read();
    q.addEventListener("change", read);
    return () => q.removeEventListener("change", read);
  }, []);
  return desktop;
}

// A small teal dot that pulses once when the Onus count changes (never a constant "live" ping).
function OnusCount({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const prev = useRef(value);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (value !== prev.current) { prev.current = value; setFlash((f) => f + 1); }
  }, [value]);
  return (
    <span className="relative inline-flex items-center gap-1" data-onus-count={value}>
      {flash > 0 && !reduce && (
        <motion.span key={flash} className="absolute -left-2.5 size-1.5 rounded-full bg-brand" initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 2.4 }} transition={{ duration: 1.2 }} aria-hidden />
      )}
      <NumberFlow value={value} animated={!reduce} className="tabular-nums" />
    </span>
  );
}

function CategoryRow({ category, grades }: { category: string; grades: Grade[] }) {
  const [open, setOpen] = useState(false);
  const earned = grades.reduce((a, g) => a + g.score, 0);
  const score = grades.length ? (earned / (2 * grades.length)) * 4 : 0;
  return (
    <li className="border-b border-hairline last:border-b-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
        <span className="text-[15px] text-text">{category}</span>
        <span className="flex items-center gap-2 text-sm text-text-secondary tabular-nums">
          {score.toFixed(1)} of 4
          <ChevronRight className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-90")} aria-hidden />
        </span>
      </button>
      {open && (
        <ul className="space-y-4 px-4 pb-4">
          {grades.map((g) => (
            <li key={g.criterion_id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-text">{g.label}</p>
                <span className="shrink-0 text-xs text-text-secondary tabular-nums">{g.score} of 2</span>
              </div>
              <p className="mt-0.5 text-xs text-text-secondary">{g.note && g.score === 0 && g.note !== "Not graded." ? g.note : SCORE_WORD[g.score]}</p>
              {g.quote && (
                <blockquote className="mt-2 border-l-2 border-hairline pl-3">
                  <p className="font-mono text-[12.5px] leading-relaxed text-text">&ldquo;{g.quote}&rdquo;</p>
                  {(g.document || g.section) && (
                    <footer className="mt-1 text-xs text-text-secondary">
                      {g.document ?? "Policy"}{g.section ? `, section ${g.section}` : ""}
                    </footer>
                  )}
                </blockquote>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Action({ href, icon: Icon, label, external }: { href: string; icon: typeof Phone; label: string; external?: boolean }) {
  const cls = "flex flex-1 flex-col items-center gap-1 rounded-2xl bg-hairline/45 px-2 py-2.5 text-xs font-medium text-text transition-colors hover:bg-hairline focus-visible:outline-2 focus-visible:outline-brand";
  const body = (<><Icon className="size-[18px] text-brand" strokeWidth={1.75} aria-hidden />{label}</>);
  return external ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a> : <Link href={href} className={cls}>{body}</Link>;
}

function PanelBody({ school, onClose, onAsk }: { school: InstitutionDetail; onClose: () => void; onAsk: () => void }) {
  const { schools } = useMapState();
  const live = schools.find((s) => s.slug === school.slug)?.scores ?? school.scores;
  const graded = isGraded(live, school.policy_found);
  const gap = gapDisplay(live?.gap_label ?? null, school.policy_found);
  const phone = school.contact_phone?.split(/ext/i)[0].replace(/[^\d+]/g, "");
  const docs = [
    school.policy_url && { label: "Policy", url: school.policy_url },
    school.procedures_url && { label: "Procedures", url: school.procedures_url },
  ].filter(Boolean) as { label: string; url: string }[];

  return (
    <div className="relative px-5 pb-8 pt-5">
      <button type="button" onClick={onClose} aria-label="Close"
        className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-hairline/70 text-text-secondary transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-brand">
        <X className="size-4" strokeWidth={2} aria-hidden />
      </button>

      <h2 className="pr-10 text-[26px] font-bold leading-tight tracking-tight text-text">{school.name}</h2>
      <p className="mt-1 text-sm text-text-secondary">
        {school.city}{school.city ? " · " : ""}{school.policy_found ? "Policy found" : "No public policy"}
      </p>

      <div className="mt-4 flex gap-2">
        {school.policy_found && (
          <button type="button" onClick={onAsk}
            className="flex flex-1 flex-col items-center gap-1 rounded-2xl bg-brand px-2 py-2.5 text-xs font-medium text-on-brand transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <MessageCircle className="size-[18px]" strokeWidth={1.75} aria-hidden />Ask
          </button>
        )}
        {/* No public policy: ask the school for it, by email when it publishes one, otherwise via its support page. */}
        {!school.policy_found && (school.contact_email || school.support_url || school.website) && (
          <Action
            href={school.contact_email
              ? `mailto:${school.contact_email}?subject=${encodeURIComponent("Request for your sexual violence policy")}`
              : (school.support_url ?? school.website)!}
            icon={FileQuestion} label="Request policy" external />
        )}
        {phone && <Action href={`tel:${phone}`} icon={Phone} label="Call" external />}
        {school.website && <Action href={school.website} icon={Globe} label="Website" external />}
        <Action href={`/rate/${school.slug}`} icon={PenLine} label="Review" />
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-hairline border-y border-hairline py-3 text-center">
        <div className="px-1">
          <p className="text-xs text-text-secondary">On paper</p>
          <p className="mt-1 text-2xl font-semibold text-text">{graded ? live?.paper_letter : "None"}</p>
          <p className="text-xs text-text-secondary tabular-nums">{graded ? `${live?.paper_gpa?.toFixed(2)} of 4` : school.policy_found ? "Grading in progress" : "No policy"}</p>
        </div>
        <div className="px-1">
          <p className="text-xs text-text-secondary">In practice</p>
          <p className="mt-1 text-2xl font-semibold text-text">{live?.practice_letter ?? "None"}</p>
          <p className="text-xs text-text-secondary tabular-nums">{live?.practice_gpa !== null && live?.practice_gpa !== undefined ? `${live.practice_gpa.toFixed(2)} of 4` : "Not enough ratings yet"}</p>
        </div>
        <div className="flex flex-col items-center px-1">
          <p className="text-xs text-text-secondary">The gap</p>
          <Badge variant={gap.variant} className="mt-2 h-auto whitespace-normal py-1 text-center leading-tight">{gap.word}</Badge>
          {live?.gap !== null && live?.gap !== undefined && <p className="mt-1 text-xs text-text-secondary tabular-nums">{Math.abs(live.gap).toFixed(1)} points</p>}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-text-secondary">
        <span className="tabular-nums">{live?.n_public ?? 0}</span> public records · <OnusCount value={live?.n_onus ?? 0} /> Onus · <span className="tabular-nums">{live?.n_sample ?? 0}</span> sample
        {live?.practice_everyone_only ? <><br />Fewer than 5 people went through the process, so In practice uses the questions everyone answered.</> : null}
      </p>

      {school.about && <p className="mt-5 text-[15px] leading-relaxed text-text">{school.about}</p>}

      <section className="mt-6" aria-labelledby="policy-heading">
        <h3 id="policy-heading" className="px-1 text-[13px] text-text-secondary">On paper, by category</h3>
        {!school.policy_found ? (
          <p className="mt-2 rounded-2xl bg-hairline/40 px-4 py-3 text-sm text-text">{school.policy_note ?? "No public sexual violence policy was found for this school."}</p>
        ) : !graded ? (
          <p className="mt-2 rounded-2xl bg-hairline/40 px-4 py-3 text-sm text-text">Grading in progress. This school&apos;s policy has been found and will be graded against the 17 criteria shortly.</p>
        ) : (
          <ul className="mt-2 overflow-hidden rounded-2xl bg-hairline/40">
            {CATEGORIES.map((c) => <CategoryRow key={c} category={c} grades={school.grades.filter((g) => g.category === c)} />)}
          </ul>
        )}
        {docs.length > 0 && (
          <p className="mt-2 px-1 text-xs text-text-secondary">
            Graded from the school&apos;s {docs.map((d, i) => (
              <span key={d.label}>{i > 0 && " and "}<a href={d.url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 hover:underline">{d.label.toLowerCase()}</a></span>
            ))}. Every point quotes its source.
          </p>
        )}
      </section>

      {school.public_records.length > 0 && (
        <section className="mt-6" aria-labelledby="records-heading">
          <h3 id="records-heading" className="px-1 text-[13px] text-text-secondary">Public record</h3>
          <ul className="mt-2 overflow-hidden rounded-2xl bg-hairline/40">
            {school.public_records.map((r, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
                <span className="text-sm text-text">{r.metric} <span className="text-text-secondary">({r.year})</span></span>
                <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand tabular-nums">{r.value}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6" aria-labelledby="contact-heading">
        <h3 id="contact-heading" className="px-1 text-[13px] text-text-secondary">Who to contact</h3>
        <ul className="mt-2 overflow-hidden rounded-2xl bg-hairline/40 text-sm">
          {school.contact_office && <li className="border-b border-hairline px-4 py-3 text-text">{school.contact_office}</li>}
          {school.contact_email && <li className="border-b border-hairline px-4 py-3"><a className="text-brand" href={`mailto:${school.contact_email}`}>{school.contact_email}</a></li>}
          {school.contact_phone && phone && <li className="border-b border-hairline px-4 py-3"><a className="text-brand" href={`tel:${phone}`}>{school.contact_phone}</a></li>}
          {school.support_url && <li className="px-4 py-3"><a className="text-brand" href={school.support_url} target="_blank" rel="noopener noreferrer">Support page</a></li>}
        </ul>
      </section>

      <Link href="/support" prefetch={false} className="mt-6 inline-block px-1 text-sm font-medium text-support underline-offset-4 hover:underline">Get help</Link>
    </div>
  );
}

export function SchoolPanel({ school }: { school: InstitutionDetail }) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const reduce = useReducedMotion();
  const [full, setFull] = useState(false);
  // The Ask sheet opens in place of the school details (same glass panel; never glass on glass).
  // The conversation is kept while you go back and forth, and starts fresh for each school.
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const openAsk = () => { setAsking(true); setFull(true); };
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ y0: number; base: number; decided: boolean; active: boolean; fromHandle: boolean } | null>(null);
  const close = () => router.push("/map", { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key !== "Escape") return; if (asking) setAsking(false); else close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking]);

  // Phone sheet gestures (desktop is a sidebar and ignores these). At half height a vertical swipe anywhere
  // moves the sheet (the content doesn't scroll there); at full height the content scrolls, and a swipe down
  // from the grabber or header, or from the content already scrolled to the top, collapses it to half.
  const onPointerDown = (e: React.PointerEvent) => {
    if (desktop || !sheetRef.current) return;
    // Typing and selecting text in the Ask box never moves the sheet.
    if ((e.target as HTMLElement).closest("textarea")) return;
    const fromHandle = !!(e.target as HTMLElement).closest("[data-sheet-handle]");
    gesture.current = { y0: e.clientY, base: sheetRef.current.getBoundingClientRect().height, decided: false, active: false, fromHandle };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !sheetRef.current) return;
    const dy = e.clientY - g.y0;
    if (!g.decided) {
      if (Math.abs(dy) < 6) return;
      g.decided = true;
      g.active = !full || g.fromHandle || (dy > 0 && (scrollRef.current?.scrollTop ?? 0) <= 0);
      if (g.active) sheetRef.current.setPointerCapture(e.pointerId);
    }
    if (g.active) {
      const max = (sheetRef.current.parentElement?.getBoundingClientRect().height ?? window.innerHeight) - 12;
      setDragHeight(Math.min(max, Math.max(96, g.base - dy)));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setDragHeight(null);
    if (!g?.active) return;
    const dy = e.clientY - g.y0;
    if (dy < -40) setFull(true);
    else if (dy > 40) { if (full) setFull(false); else if (dy > 120) close(); }
  };

  // One element, laid out by CSS: a bottom sheet by default and a sidebar from 768 px, so the first paint
  // is already right on every screen. Opening a school always starts the sheet at half height.
  return (
    <aside
      ref={sheetRef}
      aria-label={school.name}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current = null; setDragHeight(null); }}
      // A swipe that starts on a link or image must move the sheet, not start the browser's native drag.
      onDragStart={(e) => { if (!desktop) e.preventDefault(); }}
      style={dragHeight !== null && !desktop ? { height: dragHeight, transition: "none" } : undefined}
      className={cn(
        "glass pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[28px] pb-[env(safe-area-inset-bottom,0px)]",
        !reduce && "transition-[height] duration-300 ease-out",
        full ? "h-[calc(100%-12px)]" : "h-[52%] touch-none",
        "md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:h-auto md:w-[400px] md:touch-auto md:rounded-[28px] md:pb-0 md:transition-none"
      )}
    >
      <button type="button" data-sheet-handle onClick={() => setFull((f) => !f)} aria-label={full ? "Show less" : "Show more"}
        className="mx-auto flex h-7 w-full shrink-0 touch-none items-center justify-center md:hidden">
        <span className="h-1.5 w-10 rounded-full bg-text-secondary/40" />
      </button>
      {asking ? (
        <AskView slug={school.slug} school={school.name} messages={messages} setMessages={setMessages} onBack={() => setAsking(false)} scrollRef={scrollRef} />
      ) : (
        <div ref={scrollRef} className={cn("min-h-0 flex-1 overscroll-contain", full || desktop ? "overflow-y-auto" : "overflow-hidden", "md:overflow-y-auto")}>
          <PanelBody school={school} onClose={close} onAsk={openAsk} />
        </div>
      )}
    </aside>
  );
}
