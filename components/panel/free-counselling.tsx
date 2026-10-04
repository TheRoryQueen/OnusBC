import { ExternalLink, Phone } from "lucide-react";
import counselling from "@/data/counselling.json";
import { telHref } from "@/lib/tel";

// Free counselling in a school's panel: Here2Talk (24/7 for every BC post-secondary student, confirmed on the
// Province's page) and the school's own counselling page (data/counselling.json).
const C = counselling as { here2talk: { name: string; phone: string; url: string; about: string; source_url: string }; schools: Record<string, string> };

export function FreeCounselling({ slug, school }: { slug: string; school: string }) {
  const own = C.schools[slug];
  const h = C.here2talk;
  return (
    <section className="mt-6" aria-labelledby="counselling-heading">
      <h3 id="counselling-heading" className="px-1 text-[13px] text-text-secondary">Free counselling</h3>
      <ul className="mt-2 overflow-hidden rounded-2xl bg-hairline/40">
        <li className="border-b border-hairline px-4 py-3">
          <p className="text-[15px] font-medium text-text">{h.name}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-text-secondary">{h.about} <a href={h.source_url} target="_blank" rel="noopener noreferrer" className="underline decoration-current/35 underline-offset-2 hover:decoration-current">Source</a></p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={telHref(h.phone)} aria-label={`Call ${h.name}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-support/12 px-4 text-sm font-medium tabular-nums text-support"><Phone className="size-4" aria-hidden />{h.phone}</a>
            <a href={h.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-hairline/60 px-4 text-sm font-medium text-text"><ExternalLink className="size-4" aria-hidden />here2talk.ca</a>
          </div>
        </li>
        {own && (
          <li>
            <a href={own} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-[15px] text-brand">
              Counselling at {school}<ExternalLink className="size-4 shrink-0" aria-hidden />
            </a>
          </li>
        )}
      </ul>
    </section>
  );
}
