import { gapDisplay } from "@/lib/grades";
import type { InstitutionSummary } from "@/lib/types";

// The school dots, server-rendered into the first HTML so they show at first paint, before MapLibre
// (about 1 MB of JavaScript) has loaded. Same Web Mercator projection and the same initial framing as the
// map's fitBounds (the INITIAL_BOUNDS box, padding 24 px, uniform scale, centred), so the dots sit where
// MapLibre will draw them; the map fades this out once its own dots are on screen.
export const INITIAL_BOUNDS: [[number, number], [number, number]] = [[-129.5, 48.2], [-114.5, 56.5]];
export const INITIAL_PADDING = 24;

const mx = (lng: number) => (lng + 180) / 360;
const my = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};

export function DotsPreview({ schools, hidden }: { schools: InstitutionSummary[]; hidden?: boolean }) {
  const [[w, s], [e, n]] = INITIAL_BOUNDS;
  const x0 = mx(w), x1 = mx(e), y0 = my(n), y1 = my(s);
  // viewBox in Mercator units scaled up so path coordinates stay readable.
  const k = 10000;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute transition-opacity duration-300 motion-reduce:transition-none"
      style={{ inset: INITIAL_PADDING, opacity: hidden ? 0 : 1 }}
    >
      <svg viewBox={`${x0 * k} ${y0 * k} ${(x1 - x0) * k} ${(y1 - y0) * k}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full overflow-visible">
        {schools.map((sch) => {
          const gap = gapDisplay(sch.scores?.gap_label ?? null, sch.policy_found);
          const d = `M${mx(sch.lng) * k} ${my(sch.lat) * k}h0`;
          return (
            <g key={sch.slug}>
              {/* Zero-length round-capped strokes with non-scaling width draw a dot of exact pixel size. */}
              <path d={d} stroke="var(--onus-page)" strokeWidth={17} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={d} stroke={`var(${gap.token})`} strokeOpacity={gap.variant === "neutral" ? 0.45 : 1} strokeWidth={13} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
