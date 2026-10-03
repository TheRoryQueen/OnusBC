import dots from "@/lib/hero-dots.json";
import { LivingDots } from "./living-dots";

// Homepage hero (PRD, Homepage hero): a dictionary entry in front of a faded dotted map of the Vancouver
// region, with decorative dots in the map's colours breathing on it. The same composition on every screen:
// the map is a background behind the entry, its edges fading out softly, and the hero is one screen tall.
export function Hero() {
  const { width, height, spots } = dots as { width: number; height: number; spots: { x: number; y: number; color: string }[] };
  const land = { maskImage: "url(/hero-land.svg)", WebkitMaskImage: "url(/hero-land.svg)", maskSize: "contain", WebkitMaskSize: "contain", maskPosition: "center", WebkitMaskPosition: "center", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" } as const;
  // A soft radial fade so the map has no hard edges.
  const fade = { maskImage: "radial-gradient(closest-side, #000 55%, transparent 100%)", WebkitMaskImage: "radial-gradient(closest-side, #000 55%, transparent 100%)" } as const;

  return (
    <section aria-labelledby="hero-word" className="relative isolate flex min-h-[calc(100dvh-4rem)] items-center overflow-hidden">
      {/* The watermark: about 12 percent presence. Centred behind the entry on phones, weighted right from sm. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center sm:justify-end">
        <div className="relative aspect-[91/86] h-[118%] max-h-[64rem] sm:mr-[-6%] sm:h-[124%] lg:mr-[2%]" style={fade}>
          <div className="absolute inset-0 bg-text-secondary opacity-[0.16]" style={land} />
          <LivingDots spots={spots} width={width} height={height} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">
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
