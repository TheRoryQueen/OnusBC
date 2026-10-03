import dots from "@/lib/bc-dots.json";
import { cn } from "@/lib/utils";

// A still, stripped-back dotted silhouette of BC (docs/components.md section 2, cropped to the PRD's
// bounds), with the real school locations. Decorative: hidden from assistive tech. Land dots use the
// text-secondary token at low opacity; school dots use the brand teal. The homepage hero adds the
// "living" school dots on top of this in milestone 11.
export function BCDottedMap({ className, landOpacity = 0.14, showSchools = true, fit = "meet" }: {
  className?: string; landOpacity?: number; showSchools?: boolean; fit?: "meet" | "slice";
}) {
  const { width, height, points, schools } = dots as { width: number; height: number; points: number[][]; schools: { slug: string; x: number; y: number }[] };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={`xMidYMid ${fit}`} className={cn("h-full w-full", className)} aria-hidden focusable="false">
      <g fill="var(--onus-text-secondary)" fillOpacity={landOpacity}>
        {points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.28} />)}
      </g>
      {showSchools && (
        <g fill="var(--onus-brand)" fillOpacity={Math.min(1, landOpacity * 2.2)}>
          {schools.map((s) => <circle key={s.slug} cx={s.x} cy={s.y} r={0.55} />)}
        </g>
      )}
    </svg>
  );
}
