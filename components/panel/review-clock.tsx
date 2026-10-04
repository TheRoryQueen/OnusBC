"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatDate, isPastDue, nextReviewBy, type ReviewDate } from "@/lib/review-clock";
import type { Grade } from "@/lib/types";
import { cn } from "@/lib/utils";
import { QuoteButton } from "@/components/documents/viewer-context";

// The review clock in a school's panel. It only ever says what the published policy shows: a school may
// have reviewed its policy without republishing it, so nothing here says a school broke the law.
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export function ReviewClock({ slug, school, date, note, weakest, lawUrl, rank }: {
  rank: { place: number; of: number; tied: boolean } | null;
  slug: string; school: string; date: ReviewDate | null; note: string | null; weakest: Grade[]; lawUrl: string;
}) {
  const [showQuote, setShowQuote] = useState(false);
  const due = date ? nextReviewBy(date.iso) : null;
  const passed = date ? isPastDue(date.iso) : false;

  return (
    <section className="mt-6" aria-labelledby="review-heading">
      <h3 id="review-heading" className="px-1 text-[13px] text-text-secondary">Review clock</h3>
      <div className="mt-2 overflow-hidden rounded-2xl bg-hairline/40 text-[15px]">
        {date ? (
          <>
            <button type="button" onClick={() => setShowQuote((s) => !s)} aria-expanded={showQuote}
              className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-hairline px-4 py-3 text-left">
              <span className="text-text">Published policy last revised <span className="font-medium">{formatDate(date.iso)}</span></span>
              <ChevronRight className={cn("size-4 shrink-0 text-text-secondary transition-transform motion-reduce:transition-none", showQuote && "rotate-90")} aria-hidden />
            </button>
            {showQuote && (
              <div className="border-b border-hairline px-4 py-3">
                <QuoteButton target={{ slug, school, role: date.from, quote: date.quote }} className="block w-full text-left focus-visible:outline-2 focus-visible:outline-brand">
                  <span className="block font-mono text-[12.5px] leading-relaxed text-text">&ldquo;{date.quote}&rdquo;</span>
                  <span className="mt-1.5 block text-[12px] text-text-secondary">
                    As printed in the school&apos;s {date.from === "procedures" ? "procedures" : "policy"}. <span className="text-brand">Open in the {date.from === "procedures" ? "procedures" : "policy"}</span>
                  </span>
                </QuoteButton>
              </div>
            )}
            <div className="px-4 py-3">
              <p className={cn("text-text", passed && "font-medium text-big-gap")}>
                Next review required by {formatDate(due!)}{passed ? " (date passed)" : ""}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                BC law requires a review at least every 3 years (<a href={lawUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">Sexual Violence and Misconduct Policy Act, s. 3</a>). A school may have reviewed its policy without publishing a new date.
              </p>
            </div>
          </>
        ) : (
          <p className="px-4 py-3 text-text">{note ?? "No date published."}</p>
        )}
      </div>

      {weakest.length > 0 && (
        <div className="mt-4">
          <h4 className="flex items-baseline justify-between gap-3 px-1 text-[13px] text-text-secondary">
            <span>What to raise at the review</span>
            {rank && <span className="tabular-nums">{rank.tied ? "Tied " : ""}{ordinal(rank.place)} of {rank.of} in BC on paper</span>}
          </h4>
          <ul className="mt-2 overflow-hidden rounded-2xl bg-hairline/40">
            {weakest.map((g) => (
              <li key={g.criterion_id} className="border-b border-hairline px-4 py-3 last:border-b-0">
                <p className="flex items-baseline justify-between gap-3 text-[15px] text-text">
                  <span>{g.label}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-text-secondary">{g.score} of 2</span>
                </p>
                {g.quote
                  ? <QuoteButton target={{ slug, school, role: g.document === "Procedures" ? "procedures" : "policy", quote: g.quote }} className="mt-1.5 block w-full text-left focus-visible:outline-2 focus-visible:outline-brand">
                      <span className="font-mono text-[12.5px] leading-relaxed text-text-secondary">&ldquo;{g.quote}&rdquo;</span>{g.document && g.section ? <span className="text-[12.5px] text-text-secondary"> ({g.document}, section {g.section})</span> : null}
                    </QuoteButton>
                  : <p className="mt-1 text-[13px] text-text-secondary">Not addressed in the policy.</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
