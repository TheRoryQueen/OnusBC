"use client";

import Link from "next/link";

// Any page that fails to load: a quiet retry message, never a blank screen or a raw error (PRD, Gaps).
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center px-4 py-24 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="font-serif text-[2.5rem] leading-[1.05] text-text sm:text-[3.25rem]">Something didn&apos;t load.</h1>
        <p className="mt-3 text-[16px] text-text-secondary">It&apos;s probably a connection blip. Try again in a moment.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-[15px] font-medium text-on-brand hover:bg-brand-hover">Try again</button>
          <Link href="/support" className="inline-flex min-h-12 items-center px-3 text-[15px] font-medium text-support underline-offset-4 hover:underline">Get help</Link>
        </div>
      </div>
    </main>
  );
}
