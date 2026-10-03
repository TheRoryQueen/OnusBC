"use client";

import NumberFlow from "@number-flow/react";
import { useInViewOnce } from "./in-view";

// One national statistic (docs/components.md section 3): the number counts up from 0 the first time it is
// 30 percent in view, then a plain sentence and its source. With reduced motion it shows the final number.
export function Stat({ value, label, context, source, url }: { value: number; label: string; context?: string; source: string; url: string }) {
  const { ref, seen, reduce } = useInViewOnce<HTMLDivElement>(0.3);
  return (
    <div ref={ref} className="border-t border-hairline py-7 first:border-t-0 first:pt-0">
      <p className="font-serif text-[4.25rem] leading-none text-text tabular-nums sm:text-[5rem]">
        <NumberFlow value={seen ? value : 0} suffix="%" animated={!reduce} transformTiming={{ duration: 1100, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }} />
      </p>
      <p className="mt-2 max-w-[38ch] text-[16px] leading-relaxed text-text">
        {label}.{context ? <span className="text-text-secondary"> {context}.</span> : null}
      </p>
      <p className="mt-2 text-[13px] text-text-secondary">
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-text hover:underline">{source}</a>
      </p>
    </div>
  );
}
