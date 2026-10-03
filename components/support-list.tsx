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
          className="min-h-12 w-full rounded-full bg-surface pl-11 pr-4 text-[15px] text-text ring-1 ring-inset ring-hairline placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-support/60" />
      </div>
      <p className="mt-3 px-1 text-[13px] text-text-secondary" aria-live="polite">{shown.length === offices.length ? `${offices.length} schools` : `${shown.length} of ${offices.length} schools`}</p>
      <ul className="mt-2 divide-y divide-hairline">
        {shown.map((o) => (
          <li key={o.slug} className="py-5">
            <p className="text-[17px] font-semibold tracking-tight text-text">{o.name}</p>
            {o.office && <p className="mt-0.5 text-[14px] text-text-secondary">{o.office}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {o.phone && (
                <a href={telHref(o.phone)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-support/12 px-4 text-[14px] font-medium text-support">
                  <Phone className="size-4" aria-hidden />{o.phone}
                </a>
              )}
              {o.email && (
                <a href={`mailto:${o.email}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-hairline/50 px-4 text-[14px] font-medium text-text">
                  <Mail className="size-4" aria-hidden />{o.email}
                </a>
              )}
              {o.url && (
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-hairline/50 px-4 text-[14px] font-medium text-text">
                  Support page<ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </div>
          </li>
        ))}
        {shown.length === 0 && <li className="py-6 text-[15px] text-text-secondary">No school matches that. Try a city or a shorter name.</li>}
      </ul>
    </div>
  );
}
