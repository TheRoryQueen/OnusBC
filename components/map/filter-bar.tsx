"use client";

import Link from "next/link";
import { useMapState } from "./map-state";
import { SchoolSearch } from "./school-search";

// The floating controls at the top of the map: the school search and the review clock line.
export function FilterBar({ reviewLine }: { reviewLine?: string }) {
  const { schools } = useMapState();
  return (
    <>
      <SchoolSearch />
      {reviewLine && (
        <p className="glass pointer-events-auto mt-2 rounded-[18px] px-3 py-2 text-xs text-text-secondary md:w-[340px]">
          {reviewLine} <a href="/how-it-works#review-clock" className="font-medium text-brand underline-offset-2 underline decoration-current/35 hover:decoration-current">How this is counted</a>
        </p>
      )}
      {/* The map canvas can't be tabbed through; these links give keyboard and screen reader users every school. */}
      <nav aria-label="Schools" className="sr-only focus-within:not-sr-only focus-within:glass focus-within:pointer-events-auto focus-within:mt-2 focus-within:max-h-72 focus-within:overflow-auto focus-within:rounded-[18px] focus-within:p-3">
        <ul className="grid gap-1 text-sm">
          {schools.map((s) => (
            <li key={s.slug}>
              <Link href={`/map/${s.slug}`} scroll={false} className="text-text underline-offset-2 focus-visible:underline">{s.name}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
