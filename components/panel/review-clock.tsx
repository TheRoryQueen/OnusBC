"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatDate, isPastDue, nextReviewBy, type ReviewDate } from "@/lib/review-clock";
import type { Grade } from "@/lib/types";
import { cn } from "@/lib/utils";

// The review clock in a school's panel. It only ever says what the published policy shows: a school may
// have reviewed its policy without republishing it, so nothing here says a school broke the law.
export function ReviewClock({ date, note, weakest, lawUrl }: {
  date: ReviewDate | null; note: string | null; weakest: Grade[]; lawUrl: string;
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
                <p className="font-mono text-[12.5px] leading-relaxed text-text">&ldquo;{date.quote}&rdquo;</p>
                <p className="mt-1.5 text-[12px] text-text-secondary">
                  As printed in the school&apos;s {date.from === "procedures" ? "procedures" : "policy"}. <a href={date.url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 hover:underline">Open the document</a>
                </p>
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
          <h4 className="px-1 text-[13px] text-text-secondary">What to raise at the review</h4>
          <ul className="mt-2 overflow-hidden rounded-2xl bg-hairline/40">
            {weakest.map((g) => (
              <li key={g.criterion_id} className="border-b border-hairline px-4 py-3 last:border-b-0">
                <p className="flex items-baseline justify-between gap-3 text-[15px] text-text">
                  <span>{g.label}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-text-secondary">{g.score} of 2</span>
                </p>
                {g.quote
                  ? <p className="mt-1.5 font-mono text-[12.5px] leading-relaxed text-text-secondary">&ldquo;{g.quote}&rdquo;{g.document && g.section ? <span className="font-sans"> ({g.document}, section {g.section})</span> : null}</p>
                  : <p className="mt-1 text-[13px] text-text-secondary">Not addressed in the policy.</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
