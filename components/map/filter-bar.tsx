"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useMapState, type Mode, type TypeFilter } from "./map-state";

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
            "whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
            value === o.value ? "bg-surface font-medium text-text shadow-sm" : "text-text-secondary hover:text-text"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const LEGEND = [
  { token: "bg-aligned", word: "Aligned" },
  { token: "bg-some-gap", word: "Some gap" },
  { token: "bg-big-gap", word: "Big gap" },
  { token: "bg-no-policy", word: "No public policy" },
];

export function FilterBar({ reviewLine }: { reviewLine?: string }) {
  const { mode, setMode, typeFilter, setTypeFilter, schools } = useMapState();
  return (
    <>
      <div className="glass pointer-events-auto flex flex-col gap-2 rounded-[22px] p-2 md:flex-row md:items-center">
        <Segmented<TypeFilter>
          label="Type of school"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[{ value: "all", label: "All" }, { value: "college", label: "Colleges" }, { value: "university", label: "Universities" }]}
        />
        <Segmented<Mode>
          label="What the map shows"
          value={mode}
          onChange={setMode}
          options={[{ value: "paper", label: "On paper" }, { value: "practice", label: "In practice" }, { value: "gap", label: "The gap" }]}
        />
      </div>
      {mode === "gap" && (
        <ul className="glass pointer-events-auto mt-2 flex flex-wrap gap-x-3 gap-y-1 rounded-[18px] px-3 py-2 text-xs text-text-secondary" aria-label="Legend">
          {LEGEND.map((l) => (
            <li key={l.word} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", l.token)} aria-hidden />
              {l.word}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            {/* Neutral grey covers both: no paper grade yet (grading in progress) and too few ratings. */}
            <span className="size-2.5 rounded-full bg-text-secondary/45" aria-hidden />
            Not graded yet
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-support" aria-hidden />
            Sexual assault support
          </li>
        </ul>
      )}
      {reviewLine && (
        <p className="glass pointer-events-auto mt-2 rounded-[18px] px-3 py-2 text-xs text-text-secondary">
          {reviewLine} <a href="/how-it-works#review-clock" className="font-medium text-brand underline-offset-2 hover:underline">How this is counted</a>
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
