import dots from "@/lib/bc-dots.json";
import { BCDottedMap } from "@/components/bc-dotted-map";
import { LivingDots } from "./living-dots";

// Homepage hero (PRD, Homepage hero): a dictionary entry in front of a faded dotted silhouette of BC, with
// the real school locations breathing on it. Nothing else on the first screen.
export function Hero() {
  const { width, height, schools } = dots as { width: number; height: number; schools: { x: number; y: number }[] };
  // Campuses in the same city share a spot on a map this coarse; one breathing dot per spot.
  const spots = [...new Map(schools.map((s) => [`${Math.round(s.x)}:${Math.round(s.y)}`, { x: s.x, y: s.y }])).values()];

  return (
    <section aria-labelledby="hero-word" className="relative isolate flex min-h-[calc(100dvh-4rem)] items-start overflow-hidden pt-[9vh] sm:items-center sm:pt-0">
      {/* The watermark: land only, about 12 percent presence. Weighted right so the entry sits on the Pacific. */}
      {/* Phones: the entry on top, BC filling the lower half. From sm: side by side. */}
      <div aria-hidden className="pointer-events-none absolute -right-[22%] bottom-[3%] left-[2%] top-[46%] -z-10 sm:inset-y-[6%] sm:-right-[8%] sm:left-[34%] lg:left-[38%] lg:right-[2%]">
        <BCDottedMap showSchools={false} landOpacity={0.13} />
        <LivingDots spots={spots} width={width} height={height} />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <article className="max-w-[34rem]">
          <h1 id="hero-word" className="font-serif text-[clamp(5.5rem,22vw,10.5rem)] leading-[0.9] tracking-[-0.02em] text-text">onus</h1>
          <p className="mt-3 flex items-baseline gap-4 font-serif text-[1.375rem] text-text-secondary">
            <span>/ˈōnəs/</span>
            <span className="italic">noun</span>
          </p>
          <hr className="my-6 border-hairline sm:my-7" />
          <ol className="font-serif text-[1.625rem] leading-snug text-text sm:text-[1.875rem]">
            <li className="grid grid-cols-[1.5rem_1fr] gap-x-3 sm:grid-cols-[1.75rem_1fr]">
              {/* Sense number in the sans, as dictionaries set it: Instrument Serif's 1 reads as an l. */}
              <span className="pt-[0.35em] font-sans text-[0.95rem] font-semibold text-text-secondary">1</span>
              <span>a burden, duty, or responsibility.</span>
              {/* The usage example, set the way dictionaries set them: italic, after the sense. */}
              <span className="col-start-2 mt-3 italic">the onus is on them.</span>
            </li>
          </ol>
        </article>
      </div>
    </section>
  );
}
