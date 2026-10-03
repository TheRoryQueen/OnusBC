"use client";

// A school's panel that fails to load: the map stays; a quiet retry where the panel would be (PRD, Gaps).
export default function PanelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="glass pointer-events-auto absolute inset-x-3 bottom-3 z-20 rounded-[24px] p-5 md:inset-x-auto md:left-4 md:top-4 md:bottom-auto md:w-[360px]">
      <p className="text-[15px] text-text">This school didn&apos;t load. Try again in a moment.</p>
      <button type="button" onClick={reset} className="mt-3 inline-flex min-h-10 items-center rounded-full bg-brand px-5 text-[14px] font-medium text-on-brand hover:bg-brand-hover">Try again</button>
    </div>
  );
}
