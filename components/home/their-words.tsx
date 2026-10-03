"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Homepage, third screen: their words (PRD; docs/components.md section 8, adapted from the scroll burn
// text). Each approved quote comes forward as you scroll, holds long enough to read, then dissolves from
// the middle outward; its attribution stays a beat longer. The words fade; the record stays.
// Changes from the reference: Instrument Serif at normal weight, a calmer lens, no colour-split shadow, no
// grain, a plain "scroll" hint, 120vh of scroll per quote. Reduced motion: the quotes as a plain list.

export type Quote = { id: string; text: string; attribution: string; publication: string; url: string };

const BURN_AT = 0.62; // progress through a quote's slot where it starts to dissolve
const BURN_SPAN = 0.38; // how much of the slot the dissolve takes
const LEAD = 0.7; // slots of approach before the first quote reaches the front
const DIM = 0.3; // alpha of a quote still arriving behind the one in front
const OPEN = 0.22; // how far into its fade the first quote is on the opening frame
const FAR = 1.6, NEAR = 0.85; // the lens: about 0.8x to 1x while it is read, about 1.2x as it goes
const RAMP = 0.09; // the burn one glyph fades over (matches the 0.09 in the glyph class)
const LINGER = 0.3; // slots the attribution stays after its quote has gone
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// Typographic quotes for display only (the stored text stays exactly as published): straight single quotes
// become curly ones, opening after a space or at the start, closing elsewhere.
const curly = (t: string) => t.replace(/(^|[\s(])'/g, "$1\u2018").replace(/'/g, "\u2019");

export function TheirWords({ quotes }: { quotes: Quote[] }) {
  const [reduce, setReduce] = useState(false);
  const runwayRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const creditRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const count = quotes.length;

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduce(q.matches);
    read();
    q.addEventListener("change", read);
    return () => q.removeEventListener("change", read);
  }, []);

  useEffect(() => {
    if (reduce) return;
    const el = runwayRef.current;
    if (!el) return;

    // Each glyph's dissolve threshold, from where it sits in its quote: the middle goes first, the corners
    // hold out longest, with two crossed waves so it eats in blobs rather than as a wipe.
    const measure = () => {
      blockRefs.current.forEach((block) => {
        if (!block) return;
        const w = block.offsetWidth || 1, h = block.offsetHeight || 1;
        (Array.from(block.children) as HTMLElement[]).forEach((node) => {
          const x = (node.offsetLeft + node.offsetWidth / 2) / w;
          const y = (node.offsetTop + node.offsetHeight / 2) / h;
          const blob = 0.5 + 0.28 * Math.sin(x * 11.3 + y * 6.1 + 1.7) + 0.22 * Math.sin(x * 5.7 - y * 13.9 + 4.2);
          const middle = Math.hypot(x - 0.5, (y - 0.5) * 1.15) / 0.62;
          node.style.setProperty("--t", `${clamp01(0.05 + 0.55 * middle + 0.45 * blob)}`);
        });
      });
    };

    const burnt: number[] = [];
    let front = -1, raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const p = clamp01(-rect.top / (rect.height - window.innerHeight || 1));
      // The runway ends with the last quote whole, at the moment its dissolve would start; its attribution
      // is showing then too.
      const t = -LEAD + p * (count - 1 + LEAD + BURN_AT);
      let now = 0;
      blockRefs.current.forEach((block, i) => {
        const wrap = block?.parentElement;
        if (!block || !wrap) return;
        const q = t - i;
        if (q > 1) now = Math.min(i + 1, count - 1);
        // The first quote is faintly there on the opening frame; each later one only appears once the quote in
        // front of it starts to dissolve, so two quotes never sit legibly on top of each other.
        const arrive = i === 0 ? clamp01((q + LEAD + OPEN) / 0.45) : clamp01((q + 1 - BURN_AT - 0.18) / 0.25);
        const alpha = arrive * (DIM + (1 - DIM) * clamp01(q / 0.45));
        if (alpha <= 0 || q > 1) wrap.style.visibility = "hidden";
        else {
          wrap.style.visibility = "visible";
          wrap.style.opacity = `${alpha}`;
          const depth = Math.max(FAR - ((FAR - NEAR) * (q + LEAD)) / (1 + LEAD), NEAR);
          wrap.style.transform = `scale(${1 / depth})`;
          const burn = clamp01((q - BURN_AT) / BURN_SPAN) * (1 + RAMP);
          if (burnt[i] !== burn) { burnt[i] = burn; block.style.setProperty("--b", `${burn}`); }
        }
        // The attribution: in once the quote is at the front, out a beat after the quote is gone.
        const credit = creditRefs.current[i];
        if (credit) {
          const a = clamp01((q - 0.3) / 0.15) * clamp01((1 + LINGER - q) / 0.15);
          credit.style.opacity = `${a}`;
          credit.style.pointerEvents = a > 0.5 ? "auto" : "none";
        }
      });
      if (hintRef.current) hintRef.current.style.opacity = `${clamp01(1 - p / 0.08)}`;
      if (front !== now) {
        front = now;
        if (counterRef.current) counterRef.current.textContent = `${String(now + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    const onResize = () => { measure(); onScroll(); };
    measure();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduce, count]);

  // The visible credits move with the scroll and are hidden from assistive tech, so their links stay out of
  // the tab order; the screen-reader copy below carries the same links.
  const credit = (q: Quote, tabbable = true) => (
    <>{q.attribution}, via <a href={q.url} target="_blank" rel="noopener noreferrer" tabIndex={tabbable ? undefined : -1} className="underline underline-offset-2 hover:text-text">{q.publication}</a></>
  );
  const column = "relative w-[min(86vw,38rem)] text-center font-serif text-[clamp(1.75rem,7vw,3.25rem)] leading-[1.12] text-text";

  if (reduce) {
    return (
      <section aria-label="Their words" className="border-t border-hairline">
        <div className="mx-auto grid max-w-2xl gap-14 px-4 py-24 sm:px-6">
          {quotes.map((q) => (
            <figure key={q.id}>
              <blockquote className="font-serif text-[clamp(1.5rem,5vw,2.25rem)] leading-[1.2] text-text">&ldquo;{curly(q.text)}&rdquo;</blockquote>
              <figcaption className="mt-3 text-[13px] text-text-secondary">{credit(q)}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Their words" className="border-t border-hairline">
      <div ref={runwayRef} style={{ height: `calc(120vh * ${count})` }} className="w-full">
        <div className="sticky top-0 h-[100dvh] w-full overflow-hidden">
          <div ref={counterRef} aria-hidden className="pointer-events-none absolute bottom-6 right-4 z-10 text-[12px] tabular-nums text-text-secondary sm:right-6">
            {`01 / ${String(count).padStart(2, "0")}`}
          </div>
          <div ref={hintRef} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex flex-col items-center gap-2 text-[13px] text-text-secondary">
            scroll
            <span className="h-8 w-px bg-hairline" />
          </div>

          {quotes.map((q, i) => (
            <div key={q.id} aria-hidden style={{ visibility: "hidden" }} className="absolute inset-0 grid place-items-center will-change-transform">
              <p ref={(n) => { blockRefs.current[i] = n; }} className={column} style={{ "--b": 0 } as React.CSSProperties}>
                {Array.from(`“${curly(q.text)}”`).map((ch, k) =>
                  ch === " " ? " " : <span key={k} className="opacity-[calc((var(--t,1)_+_0.09_-_var(--b,0))*11)]">{ch}</span>,
                )}
              </p>
            </div>
          ))}

          {/* Attributions sit below the quotes and stay a beat after their quote has gone. */}
          {quotes.map((q, i) => (
            <p key={q.id} ref={(n) => { creditRefs.current[i] = n; }} aria-hidden
              className={cn("absolute inset-x-0 bottom-[18%] z-10 px-6 text-center text-[13px] text-text-secondary sm:bottom-[16%]")} style={{ opacity: 0 }}>
              {credit(q, false)}
            </p>
          ))}

          {/* The glyph layer reads as loose letters to assistive tech, so the quotes are carried once more whole. */}
          <div className="sr-only">
            {quotes.map((q) => <p key={q.id}>&ldquo;{q.text}&rdquo; {credit(q)}.</p>)}
          </div>
        </div>
      </div>
    </section>
  );
}
