import Link from "next/link";

// Not found (PRD): "This page isn't here." with links to Home and the map; the normal footer follows.
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center px-4 py-24 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="font-serif text-[3rem] leading-[1.02] text-text sm:text-[4rem]">This page isn&apos;t here.</h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/map" className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-[15px] font-medium text-on-brand hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Explore the map</Link>
          <Link href="/" className="inline-flex min-h-12 items-center rounded-full bg-surface px-6 text-[15px] font-medium text-text ring-1 ring-inset ring-hairline hover:ring-text-secondary/40">Home</Link>
        </div>
      </div>
    </main>
  );
}
