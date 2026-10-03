import dots from "@/lib/bc-dots.json";
import { cn } from "@/lib/utils";

// A still, stripped-back dotted silhouette of BC (docs/components.md section 2, cropped to the PRD's bounds
// and masked to the province's borders), with the real school locations. Decorative: hidden from
// assistive tech. The land is public/bc-land.svg used as a CSS mask, painted in the text-secondary token
// at low opacity, so it follows the theme and the page HTML stays light. School dots use the brand teal.
export function BCDottedMap({ className, landOpacity = 0.14, showSchools = true, fit = "meet" }: {
  className?: string; landOpacity?: number; showSchools?: boolean; fit?: "meet" | "slice";
}) {
  const { width, height, schools } = dots as { width: number; height: number; schools: { slug: string; x: number; y: number }[] };
  const mask = { maskImage: "url(/bc-land.svg)", maskSize: fit === "meet" ? "contain" : "cover", maskPosition: "center", maskRepeat: "no-repeat" };
  return (
    <div className={cn("relative h-full w-full", className)} aria-hidden>
      <div className="absolute inset-0 bg-text-secondary" style={{ ...mask, WebkitMaskImage: mask.maskImage, WebkitMaskSize: mask.maskSize, WebkitMaskPosition: mask.maskPosition, WebkitMaskRepeat: mask.maskRepeat, opacity: landOpacity }} />
      {showSchools && (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={`xMidYMid ${fit}`} className="absolute inset-0 h-full w-full" focusable="false">
          <g fill="var(--onus-brand)" fillOpacity={Math.min(1, landOpacity * 2.2)}>
            {schools.map((s) => <circle key={s.slug} cx={s.x} cy={s.y} r={0.55} />)}
          </g>
        </svg>
      )}
    </div>
  );
}
