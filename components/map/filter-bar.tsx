"use client";

import Link from "next/link";
import { useMapState } from "./map-state";
import { SchoolSearch } from "./school-search";

// The floating controls at the top of the map: the school search (the review clock line is in the legend).
export function FilterBar() {
  const { schools } = useMapState();
  return (
    <>
      <SchoolSearch />
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
