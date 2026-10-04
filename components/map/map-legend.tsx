"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { GRADES, RINGS, gradeToken } from "@/lib/map-style";
import { cn } from "@/lib/utils";

// The map legend, docked to the bottom-left edge of the map (beside the school panel when one is open on a
// wide screen), with the crisis line as its last row so the two can never overlap. The glyphs are drawn at
// the map's own sizes (lib/map-style.ts). Phones: folded behind one button so the map stays visible.
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

// A scale: glyphs in a row, each labelled underneath (grades, rings).
function Scale({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <div>
      <p className="text-[12px] text-text-secondary">{title}</p>
      <ul className="mt-1.5 flex items-end gap-2.5">{children}</ul>
      {note && <p className="mt-1.5 text-[11px] text-text-secondary">{note}</p>}
    </div>
  );
}
function Step({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col items-center gap-1">
      <span className="grid h-6 place-items-center">{children}</span>
      <span className="text-[11px] leading-none text-text">{label}</span>
    </li>
  );
}
// A key: one glyph and its meaning per row (routes, places).
function Key({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="grid w-7 shrink-0 place-items-center">{children}</span>
      <span className="text-[12px] leading-snug text-text">{label}</span>
    </li>
  );
}

export const SupportLine = () => <svg width={28} height={8} aria-hidden><path d="M2 4h24" stroke="var(--onus-support)" strokeWidth={4} strokeLinecap="round" /></svg>;
export const HospitalLine = () => (
  <svg width={28} height={8} aria-hidden>
    <path d="M2 4h24" stroke="var(--onus-page)" strokeWidth={5} strokeLinecap="round" />
    <path d="M3 4h22" stroke="var(--onus-text)" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="0.1 5" />
  </svg>
);
export const HospitalCross = () => (
  <svg width={12} height={12} aria-hidden>
    <path d="M4.5 0h3v4.5H12v3H7.5V12h-3V7.5H0v-3h4.5z" fill="var(--onus-page)" />
    <path d="M5 1h2v4h4v2H7v4H5V7H1V5h4z" fill="var(--onus-text)" />
  </svg>
);

export function MapLegend({ hospitalRoutes = false }: { hospitalRoutes?: boolean }) {
  const [open, setOpen] = useState(false);
  // A school panel is open (it fills the left side on wide screens): sit beside it, on the same bottom edge.
  const besidePanel = /^\/map\/[a-z0-9-]+/.test(usePathname() ?? "");
  return (
    <div
      className={cn(
        "glass pointer-events-auto absolute bottom-0 left-0 z-10 max-w-[calc(100%-24px)] rounded-tr-[22px] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2.5 md:w-[272px] md:pt-4",
        besidePanel && "md:left-[432px] md:rounded-tl-[22px]"
      )}
    >
      <div id="map-legend" role="group" aria-label="Legend" className={cn("space-y-4 pb-3 md:block", open ? "block" : "hidden")}>
        <Scale title="On paper grade">
          {GRADES.map((g) => <Step key={g} label={g}><Dot fill={gradeToken(g)} /></Step>)}
          <Step label="None"><Dot hollow /></Step>
          <li className="sr-only">From A (green) to F (red). None: no public policy.</li>
        </Scale>
        <Scale title="Students compared with the policy" note="No ring: not enough real ratings yet.">
          <Step label="Close"><Dot fill={gradeToken("C")} ring={RINGS.aligned} /></Step>
          <Step label="Worse"><Dot fill={gradeToken("C")} ring={RINGS.some_gap} /></Step>
          <Step label="Much worse"><Dot fill={gradeToken("C")} ring={RINGS.big_gap} /></Step>
          <Step label="Better"><Dot fill={gradeToken("C")} ring={RINGS.better_in_practice} /></Step>
        </Scale>
        <ul className="space-y-1.5">
          <Key label="Sexual assault support"><svg width={12} height={12} aria-hidden><circle cx={6} cy={6} r={4.5} fill="var(--onus-support)" stroke="var(--onus-page)" strokeWidth={1.5} /></svg></Key>
          <Key label="Hospital"><HospitalCross /></Key>
          <Key label="Route to sexual assault support"><SupportLine /></Key>
          {hospitalRoutes && <Key label="Route to the nearest hospital"><HospitalLine /></Key>}
        </ul>
      </div>
      <div className={cn("flex items-center gap-3 md:border-t md:border-hairline md:pt-2.5", open && "border-t border-hairline pt-2.5")}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="map-legend"
          className="hit flex min-h-8 shrink-0 items-center gap-1 text-[13px] font-medium text-text md:hidden">
          Legend <ChevronUp className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        </button>
        <p className="whitespace-nowrap text-[12px] leading-snug text-text-secondary md:whitespace-normal">
          <span className="hidden md:inline">This map grades how schools handle sexual violence. </span>In danger? <a href="tel:911" className="hit font-medium text-support">Call 911.</a> <Link href="/support" prefetch={false} className="hit font-medium text-support">Get help</Link>
        </p>
      </div>
    </div>
  );
}
