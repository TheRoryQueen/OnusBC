import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center px-4 sm:px-6">
      <div className="mx-auto w-full max-w-xl pb-24">
        <h1 className="text-3xl font-semibold tracking-tight text-text">This page isn&apos;t here.</h1>
        <div className="mt-6 flex gap-4 text-sm">
          <Link href="/" className="text-brand underline-offset-4 hover:underline">Home</Link>
          <Link href="/map" className="text-brand underline-offset-4 hover:underline">Map</Link>
        </div>
      </div>
    </main>
  );
}
