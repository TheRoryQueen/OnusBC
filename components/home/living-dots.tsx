"use client";

import { useEffect, useState } from "react";

// The hero's living dots (PRD, Homepage hero): BC's real school locations breathing on the faded landform.
// About five are lit at any moment, each on its own fade-in, hold, fade-out cycle of 3 to 6 seconds,
// started at random times, never right next to the dot that lit before it. With reduced motion they hold
// still, faint. Drawn in the same viewBox units as BCDottedMap so they sit exactly on it.

type Spot = { x: number; y: number };
const TARGET_LIT = 5;
const NEAR = 2.5; // viewBox units: closer than this to the last lit dot counts as adjacent

export function LivingDots({ spots, width, height }: { spots: Spot[]; width: number; height: number }) {
  const [lit, setLit] = useState<Record<number, number>>({}); // index -> cycle length in ms
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduce(q.matches);
    read();
    q.addEventListener("change", read);
    return () => q.removeEventListener("change", read);
  }, []);

  useEffect(() => {
    if (reduce || spots.length === 0) return;
    let alive = true;
    let last = -1;
    const timers = new Set<number>();
    const on = new Set<number>();
    const later = (fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); };

    const lightOne = () => {
      const lastSpot = last >= 0 ? spots[last] : null;
      const free = spots.map((_, i) => i).filter((i) => !on.has(i) && (!lastSpot || Math.hypot(spots[i].x - lastSpot.x, spots[i].y - lastSpot.y) > NEAR));
      if (free.length === 0) return;
      const i = free[Math.floor(Math.random() * free.length)];
      const cycle = 3000 + Math.random() * 3000;
      on.add(i);
      last = i;
      setLit((m) => ({ ...m, [i]: cycle }));
      later(() => { on.delete(i); setLit((m) => { const n = { ...m }; delete n[i]; return n; }); }, cycle);
    };
    // Keep about five breathing: light a new one at a random interval whenever fewer are on.
    const tick = () => {
      if (on.size < TARGET_LIT) lightOne();
      later(tick, 500 + Math.random() * 900);
    };
    // A staggered start, so the first frame doesn't light five at once.
    for (let k = 0; k < 3; k++) later(lightOne, 300 + k * (700 + Math.random() * 600));
    later(tick, 2600);
    return () => { alive = false; timers.forEach((t) => window.clearTimeout(t)); };
  }, [reduce, spots]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" aria-hidden focusable="false">
      {spots.map((s, i) => {
        const cycle = lit[i];
        return (
          <g key={i} className={reduce ? "opacity-40" : cycle ? "onus-breathe" : "opacity-0"} style={cycle ? ({ "--onus-breath": `${cycle}ms` } as React.CSSProperties) : undefined}>
            {/* A soft halo, then the dot: two flat circles, no gradient. */}
            <circle cx={s.x} cy={s.y} r={1.25} fill="var(--onus-brand)" fillOpacity={0.12} />
            <circle cx={s.x} cy={s.y} r={0.75} fill="var(--onus-brand)" fillOpacity={0.2} />
            <circle cx={s.x} cy={s.y} r={0.4} fill="var(--onus-brand)" fillOpacity={0.8} />
          </g>
        );
      })}
    </svg>
  );
}
