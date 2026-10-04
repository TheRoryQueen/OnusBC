"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { MapLegend } from "./map-legend";
import { useMapState, type TypeFilter } from "./map-state";

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-hairline/50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "hit min-w-11 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
            value === o.value ? "bg-surface font-medium text-text shadow-sm" : "text-text-secondary hover:text-text"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}


export function FilterBar({ reviewLine }: { reviewLine?: string }) {
  const { typeFilter, setTypeFilter, schools } = useMapState();
  return (
    <>
      <div className="glass pointer-events-auto flex w-fit rounded-[22px] p-2">
        <Segmented<TypeFilter>
          label="Type of school"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[{ value: "all", label: "All" }, { value: "college", label: "Colleges" }, { value: "university", label: "Universities" }]}
        />
      </div>
      <MapLegend />
      {reviewLine && (
        <p className="glass pointer-events-auto mt-2 rounded-[18px] px-3 py-2 text-xs text-text-secondary">
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
