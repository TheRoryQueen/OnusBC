"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Mail, Phone, Search } from "lucide-react";
import { telHref } from "@/lib/tel";

// Support at your school (PRD, Get support): every institution's support office from the institutions table,
// filtered as you type. Nothing typed here is stored or sent anywhere.
export type Office = { slug: string; name: string; city: string | null; office: string | null; phone: string | null; email: string | null; url: string | null };


export function SupportList({ offices }: { offices: Office[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? offices.filter((o) => `${o.name} ${o.slug.replace(/-/g, " ")} ${o.city ?? ""} ${o.office ?? ""}`.toLowerCase().includes(t)) : offices;
  }, [q, offices]);
  return (
    <div>
      <label htmlFor="school-search" className="sr-only">Find your school</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-secondary" aria-hidden />
        <input id="school-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find your school" autoComplete="off"
          className="min-h-12 w-full rounded-full bg-surface/70 pl-11 pr-4 text-[15px] text-text ring-1 ring-inset ring-hairline placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-support/60" />
      </div>
      <p className="mt-3 px-1 text-[13px] text-text-secondary" aria-live="polite">{shown.length === offices.length ? `${offices.length} schools` : `${shown.length} of ${offices.length} schools`}</p>
      <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
        {shown.map((o) => (
          <li key={o.slug} className="grid gap-x-8 gap-y-1 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div>
              <p className="text-[17px] font-medium tracking-tight text-text">{o.name}</p>
              {o.office && <p className="mt-0.5 text-[14px] text-text-secondary">{o.office}</p>}
            </div>
            <ul className="-ml-1 flex flex-wrap items-center gap-x-4 sm:ml-0 sm:flex-col sm:items-end sm:gap-0">
              {o.phone && (
                <li><a href={telHref(o.phone)} aria-label={`Call ${o.name}, ${o.phone}`} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-medium tabular-nums text-support underline-offset-4 hover:underline">
                  <Phone className="size-3.5" aria-hidden />{o.phone}
                </a></li>
              )}
              {o.email && (
                <li><a href={`mailto:${o.email}`} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[14px] text-text underline-offset-4 hover:underline">
                  <Mail className="size-3.5 text-text-secondary" aria-hidden />{o.email}
                </a></li>
              )}
              {o.url && (
                <li><a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[14px] text-text underline-offset-4 hover:underline">
                  Support page<ExternalLink className="size-3 text-text-secondary" aria-hidden />
                </a></li>
              )}
            </ul>
          </li>
        ))}
        {shown.length === 0 && <li className="py-6 text-[15px] text-text-secondary">No school matches that. Try a city or a shorter name.</li>}
      </ul>
    </div>
  );
}
