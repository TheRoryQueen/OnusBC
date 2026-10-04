"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { GRADES, RINGS, gradeToken } from "@/lib/map-style";
import { cn } from "@/lib/utils";

// The map legend: titled groups of drawn glyphs, each labelled underneath. The glyphs use the same sizes as
// the map (lib/map-style.ts): a 4.5 px dot with an ink outline, rings outside it, purple support dots.
const DOT = 5.5; // a touch larger than the map dot so the legend reads at a glance

function Dot({ fill, hollow, ring }: { fill?: string; hollow?: boolean; ring?: { width: number; token: string; detached: boolean } }) {
  const gap = ring?.detached ? 2.5 : 0;
  const outer = DOT + 1.25 + gap + (ring?.width ?? 0);
  const size = Math.ceil(outer * 2) + 2;
  const c = size / 2;
  return (
    <svg width={size} height={size} aria-hidden className="shrink-0">
      {ring && <circle cx={c} cy={c} r={DOT + 1.25 + gap + ring.width / 2} fill="none" stroke={`var(${ring.token})`} strokeWidth={ring.width} />}
      <circle cx={c} cy={c} r={DOT} fill={hollow ? "var(--onus-page)" : `var(${fill})`} stroke={hollow ? "var(--onus-no-policy)" : "var(--onus-text)"} strokeWidth={hollow ? 2 : 1.25} />
    </svg>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">{title}</p>
      <ul className="mt-2 flex items-end gap-3">{children}</ul>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col items-center gap-1">
      <span className="grid h-6 place-items-center">{children}</span>
      <span className="text-[11px] leading-none text-text">{label}</span>
    </li>
  );
}

export function MapLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass pointer-events-auto mt-2 w-fit max-w-full rounded-[20px] px-4 py-3">
      {/* Phones: collapsed behind one button so the map stays visible. */}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="map-legend"
        className="flex min-h-8 items-center gap-1.5 text-[13px] font-medium text-text md:hidden">
        Legend <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      <div id="map-legend" role="group" aria-label="Legend" className={cn("flex-wrap gap-x-6 gap-y-4 md:flex", open ? "mt-3 flex" : "hidden")}>
        <Group title="On paper grade">
          {GRADES.map((g) => <Item key={g} label={g}><Dot fill={gradeToken(g)} /></Item>)}
          <Item label="None"><Dot hollow /></Item>
          <li className="sr-only">From A (green) to F (red). None: no public policy.</li>
        </Group>
        <Group title="Students vs. policy">
          <Item label="Close"><Dot fill={gradeToken("C")} ring={RINGS.aligned} /></Item>
          <Item label="Worse"><Dot fill={gradeToken("C")} ring={RINGS.some_gap} /></Item>
          <Item label="Much worse"><Dot fill={gradeToken("C")} ring={RINGS.big_gap} /></Item>
          <Item label="Better"><Dot fill={gradeToken("C")} ring={RINGS.better_in_practice} /></Item>
          <li className="sr-only">The ring shows how students&apos; experience differs from the policy. No ring: not enough real ratings yet.</li>
        </Group>
        <Group title="Support">
          <Item label="Sexual assault support">
            <svg width={12} height={12} aria-hidden><circle cx={6} cy={6} r={4.5} fill="var(--onus-support)" stroke="var(--onus-page)" strokeWidth={1.5} /></svg>
          </Item>
        </Group>
      </div>
      <p className={cn("mt-3 text-[11px] text-text-secondary md:block", open ? "block" : "hidden")}>No ring: not enough real ratings yet.</p>
    </div>
  );
}
