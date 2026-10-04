import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { LICENSE, openData } from "@/lib/open-data";

export const metadata: Metadata = { title: "Open data · Onus", description: "Download Onus's On paper grades, quotes and review dates as CSV or JSON." };
export const revalidate = 3600;

// The open data page: what's in each file, and the downloads. No ratings and nothing personal.
export default async function DataPage() {
  const { schools, criteria } = await openData();
  const files = [
    { href: "/data/onus-schools.csv", name: "Schools (CSV)", rows: `${schools.length} schools`, body: "One row per school: On paper score (0 to 100) and letter, policy and procedures links, the date its published policy was last revised (with the exact line it came from) and when the next review is required." },
    { href: "/data/onus-criteria.csv", name: "Criteria (CSV)", rows: `${criteria.length} rows`, body: "One row per school and criterion: score (0, 1 or 2), the quote it rests on, and the document and section the quote is in." },
    { href: "/data/onus.json", name: "Everything (JSON)", rows: "both tables", body: "Both tables in one file, with the license and a short description." },
  ];
  return (
    <main className="flex-1 px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <article className="mx-auto w-full max-w-3xl">
        <h1 className="font-serif text-[3rem] leading-[1.02] text-text sm:text-[3.75rem]">Open data</h1>
        <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-text-secondary">
          Everything behind each school&apos;s On paper grade: criterion scores, the quotes they rest on, the documents and sections they come from, policy links, and review dates. {LICENSE}
        </p>
        <ul className="mt-10 divide-y divide-hairline border-y border-hairline">
          {files.map((f) => (
            <li key={f.href} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div>
                <p className="text-[17px] font-medium text-text">{f.name} <span className="text-[14px] font-normal text-text-secondary">· {f.rows}</span></p>
                <p className="mt-1 max-w-[52ch] text-[15px] leading-relaxed text-text-secondary">{f.body}</p>
              </div>
              <a href={f.href} download className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full bg-hairline/55 px-4 text-sm font-medium text-text transition-colors hover:bg-hairline">
                <Download className="size-4" aria-hidden />Download
              </a>
            </li>
          ))}
        </ul>
        <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-text-secondary">
          <h2 className="text-[19px] font-semibold tracking-tight text-text">What&apos;s not here</h2>
          <p>No ratings of any kind, real or sample, and nothing about any person. Ratings stay inside Onus, with no link to anyone&apos;s account.</p>
          <h2 className="pt-2 text-[19px] font-semibold tracking-tight text-text">How it was made</h2>
          <p>Each policy was graded by AI against 17 criteria, and every score of 1 or 2 quotes the policy word for word, checked by code. Review dates are the latest date printed in each published policy. <Link href="/how-it-works" className="text-brand underline decoration-current/35 underline-offset-2 hover:decoration-current">How it works</Link> and <Link href="/sources" className="text-brand underline decoration-current/35 underline-offset-2 hover:decoration-current">Sources</Link> explain the method.</p>
        </section>
      </article>
    </main>
  );
}
