"use client";

import NumberFlow from "@number-flow/react";
import { useInViewOnce } from "./in-view";

// One national statistic (docs/components.md section 3): the number counts up from 0 the first time it is
// 30 percent in view, then a one-line label and its source. No box: on phones the three stack with a
// hairline between them; from sm they sit in one row with hairlines between the columns.
export function Stat({ value, label, context, source, url }: { value: number; label: string; context?: string; source: string; url: string }) {
  const { ref, seen, reduce } = useInViewOnce<HTMLDivElement>(0.3);
  return (
    // Phones: number on the left, label beside it (compact). From sm: number above, label below.
    <div ref={ref} className="grid grid-cols-[5.25rem_1fr] items-start gap-x-4 border-t border-hairline py-4 first:border-t-0 first:pt-0 sm:block sm:border-l sm:border-t-0 sm:px-6 sm:py-0 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0">
      <p className="-mt-1 font-serif text-[2.75rem] leading-none text-text tabular-nums sm:-mb-3 sm:mt-0 sm:text-[3.25rem] lg:text-[3.75rem]">
        <NumberFlow value={seen ? value : 0} suffix="%" animated={!reduce} transformTiming={{ duration: 1100, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }} />
      </p>
      <div>
        <p className="text-[14px] leading-snug text-text">
          {label}.{context ? <span className="text-text-secondary"> {context}.</span> : null}
        </p>
        <p className="mt-1.5 text-[12px] text-text-secondary">
          <a href={url} target="_blank" rel="noopener noreferrer" className="hit underline-offset-4 hover:text-text underline decoration-current/35 hover:decoration-current">{source}</a>
        </p>
      </div>
    </div>
  );
}
