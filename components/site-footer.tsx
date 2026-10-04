"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

// The footer (PRD, Footer; docs/components.md section 10), on every page except the full-screen map.
// The crisis numbers are here on every page, and on phones the Get help column comes first.
// No social icons and no links to pages that don't exist.

type Item = { label: string; href: string; number?: string; note?: string; external?: boolean };
const COLUMNS: { title: string; support?: boolean; order: string; items: Item[] }[] = [
  { title: "Explore", order: "order-2 sm:order-1", items: [
    { label: "Map", href: "/map" },
    { label: "Rate your school", href: "/rate" },
    { label: "How it works", href: "/how-it-works" },
  ] },
  { title: "Get help", support: true, order: "order-1 sm:order-2", items: [
    { label: "Get support", href: "/support" },
    { label: "VictimLinkBC", number: "1-800-563-0808", href: "tel:18005630808", note: "24/7", external: true },
    { label: "In danger right now? Call\u00a0911.", href: "tel:911", external: true },
  ] },
  { title: "About", order: "order-3", items: [
    { label: "Privacy", href: "/privacy" },
    { label: "Sources", href: "/sources" },
    { label: "Open data", href: "/data" },
  ] },
];

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/map")) return null;
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto grid w-full max-w-6xl gap-x-12 gap-y-12 px-4 pb-10 pt-16 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <Logo className="h-9" />
          <p className="mt-3 font-serif text-[1.75rem] italic leading-tight text-text">The onus is on them.</p>
          <p className="mt-3 text-[13px] text-text-secondary">Built solo at StormHacks 2026.</p>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className={col.order}>
              <p className={cn("text-[13px]", col.support ? "font-medium text-support" : "text-text-secondary")}>{col.title}</p>
              <ul className="mt-1.5">
                {col.items.map((it) => (
                  <li key={it.label} className="text-[15px] leading-snug">
                    {it.external ? (
                      <a href={it.href} className={cn("inline-flex min-h-11 min-w-11 flex-col justify-center underline-offset-4 hover:underline", col.support ? "text-support" : "text-text")}>
                        {it.label}{it.number && <span className="block whitespace-nowrap tabular-nums">{it.number}</span>}
                      </a>
                    ) : (
                      <Link href={it.href} prefetch={false} className={cn("inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:underline", col.support ? "text-support" : "text-text")}>{it.label}</Link>
                    )}
                    {it.note && <span className="block pb-1 text-[13px] text-text-secondary">{it.note}</span>}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-hairline pt-6 text-[12px] text-text-secondary sm:flex-row sm:justify-between lg:col-span-2">
          <p>© 2026 Onus</p>
          <p>Map data © OpenStreetMap contributors © CARTO</p>
        </div>
      </div>
    </footer>
  );
}
