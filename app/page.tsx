// Milestone 1 shell. The full homepage (BC landform backdrop, living dots, numbers, their words,
// get started, footer) is built in milestone 11 from docs/PRD.md.
export default function Home() {
  return (
    <main className="flex flex-1 items-center px-4 sm:px-6">
      <article className="mx-auto w-full max-w-xl pb-24">
        <h1 className="font-serif text-8xl leading-[1.1] text-text sm:text-9xl">onus</h1>
        <p className="mt-1 font-serif text-xl italic text-text-secondary">noun</p>
        <hr className="my-6 border-hairline" />
        <p className="font-serif text-2xl leading-snug text-text">
          1. a burden, duty, or responsibility.
        </p>
        <p className="mt-4 font-serif text-2xl leading-snug text-text [font-synthesis:none]">
          the onus is on them.
        </p>
      </article>
    </main>
  );
}
