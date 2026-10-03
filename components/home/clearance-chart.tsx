"use client";

import { cn } from "@/lib/utils";
import { useInViewOnce } from "./in-view";

// "Reported to police. Then what?" (PRD, Homepage second screen). Two plain lines, Canada 2012 to 2022, from
// data/sources.json. The lines stay undrawn until the chart is in view, then draw left to right over about
// 1.2 s; reduced motion shows them finished. Lines are SVG; labels are HTML laid over it so they keep a
// readable size on a phone instead of scaling with the drawing.

type Series = { years: number[]; not_cleared_pct: number[]; cleared_by_charge_pct: number[] };
const Y_MAX = 70; // percent at the top of the plot; the baseline is 0, so the lines aren't exaggerated
const VB = { w: 600, h: 300 };

export function ClearanceChart({ series }: { series: Series }) {
  const { ref, seen, reduce } = useInViewOnce<HTMLDivElement>(0.3);
  const { years } = series;
  const px = (i: number) => (i / (years.length - 1)) * VB.w;
  const py = (v: number) => VB.h - (v / Y_MAX) * VB.h;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join("");
  const pct = (x: number, y: number) => ({ left: `${(x / VB.w) * 100}%`, top: `${(y / VB.h) * 100}%` });
  const last = years.length - 1;
  const lines = [
    { key: "not", vals: series.not_cleared_pct, label: "Not cleared", cls: "stroke-big-gap", text: "text-big-gap", startBelow: true },
    { key: "charge", vals: series.cleared_by_charge_pct, label: "Cleared by charge", cls: "stroke-brand", text: "text-brand", startBelow: false },
  ];
  const drawn = seen;
  const fade = cn("transition-opacity duration-500", reduce ? "" : "delay-[1100ms]", drawn ? "opacity-100" : "opacity-0");

  return (
    <div ref={ref} className="w-full">
      {/* Right padding leaves room for the end labels; bottom for the year axis. */}
      <div className="relative mr-[7.5rem] mb-8 mt-8 sm:mr-[9rem]">
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="none" className="block aspect-[2/1] w-full overflow-visible" aria-hidden focusable="false">
          <line x1={0} x2={VB.w} y1={VB.h} y2={VB.h} className="stroke-hairline" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {lines.map((l) => (
            <path key={l.key} d={path(l.vals)} pathLength={1} fill="none" className={l.cls} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeDasharray: 1, strokeDashoffset: drawn ? 0 : 1, transition: reduce ? "none" : "stroke-dashoffset 1.2s cubic-bezier(0.33, 1, 0.68, 1)" }} />
          ))}
        </svg>
        {lines.map((l) => (
          <div key={l.key}>
            {/* End dot and direct label, instead of a legend. */}
            <span className={cn("absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full", l.key === "not" ? "bg-big-gap" : "bg-brand", fade)} style={pct(px(last), py(l.vals[last]))} />
            <span className={cn("absolute ml-3 -translate-y-1/2 whitespace-nowrap text-[13px] leading-tight", fade)} style={pct(px(last), py(l.vals[last]))}>
              <span className={cn("block font-semibold tabular-nums", l.text)}>{l.vals[last]}%</span>
              <span className="block text-text-secondary">{l.label}</span>
            </span>
            {/* First-year values: one above its line, one below, so 40 and 41 don't collide. */}
            <span className={cn("absolute whitespace-nowrap text-[12px] font-medium tabular-nums", l.text, fade, l.startBelow ? "mt-2" : "-mt-6")} style={pct(0, py(l.vals[0]))}>
              {l.vals[0]}%
            </span>
          </div>
        ))}
        <div className="absolute inset-x-0 top-full mt-2 flex justify-between text-[12px] tabular-nums text-text-secondary">
          {years.map((y, i) => <span key={y} className={i % 2 === 1 ? "hidden sm:inline" : ""}>{y}</span>)}
        </div>
      </div>
      {/* The numbers, for screen readers. */}
      {/* Wrapped: a table ignores sr-only's 1 px width and would widen the page. */}
      <div className="sr-only"><table>
        <caption>Sexual assaults reported to police in Canada, by clearance status, percent</caption>
        <thead><tr><th>Year</th><th>Not cleared</th><th>Cleared by charge</th></tr></thead>
        <tbody>{years.map((y, i) => <tr key={y}><td>{y}</td><td>{series.not_cleared_pct[i]}%</td><td>{series.cleared_by_charge_pct[i]}%</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
