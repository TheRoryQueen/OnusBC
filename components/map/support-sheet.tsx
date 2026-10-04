"use client";

import { useEffect, useRef } from "react";
import { ExternalLink, Navigation, Phone, X } from "lucide-react";
import { directionsUrl, kindLabel, supportById } from "@/lib/support";
import { telHref } from "@/lib/tel";
import { useMapState } from "./map-state";

// Info sheet for one sexual assault support location (a purple dot, or the panel's Nearest support): name,
// address, hours, who it serves, and call, website and Google Maps directions. Everything here is from the
// organization's own site or its health authority (data/support-centres.json).
export function SupportSheet() {
  const { supportId, setSupportId } = useMapState();
  const e = supportById(supportId);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!e) return;
    close.current?.focus();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setSupportId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [e, setSupportId]);

  if (!e) return null;
  // A published 24-hour line comes first; the office number second.
  const lines = [e.phone_24h ? { label: "24-hour line", phone: e.phone_24h } : null, { label: e.phone_24h ? "Office" : "Phone", phone: e.phone }].filter(Boolean) as { label: string; phone: string }[];
  return (
    <section role="dialog" aria-modal="false" aria-labelledby="support-sheet-title"
      className="glass pointer-events-auto absolute inset-x-3 bottom-3 z-30 rounded-[28px] p-5 md:inset-x-auto md:bottom-auto md:right-4 md:top-[136px] md:w-[380px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-medium text-support"><span className="size-2 rounded-full bg-support" aria-hidden />{kindLabel(e)}</p>
          <h2 id="support-sheet-title" className="mt-1 text-[17px] font-semibold leading-snug text-text">{e.name}</h2>
        </div>
        <button ref={close} type="button" onClick={() => setSupportId(null)} aria-label="Close support details"
          className="hit grid size-8 shrink-0 place-items-center rounded-full bg-hairline/70 text-text-secondary hover:text-text">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {e.address && <p className="mt-2 text-[14px] text-text">{e.address}</p>}
      {e.hours && <p className="mt-1 text-[13px] text-text-secondary">{e.hours}</p>}
      <p className="mt-1 text-[13px] text-text-secondary">{e.serves}</p>
      <ul className="mt-3 space-y-1">
        {lines.map((l) => (
          <li key={l.phone}>
            <a href={telHref(l.phone)} className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-support/12 px-4 text-[15px] font-medium text-support">
              <span className="flex items-center gap-2"><Phone className="size-4" aria-hidden />{l.label}</span>
              <span className="tabular-nums">{l.phone}</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <a href={directionsUrl(e)} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-hairline/60 px-4 text-sm font-medium text-text">
          <Navigation className="size-4" aria-hidden />Directions
        </a>
        <a href={e.source_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-hairline/60 px-4 text-sm font-medium text-text">
          <ExternalLink className="size-4" aria-hidden />Website
        </a>
      </div>
      <p className="mt-3 text-[12px] text-text-secondary">In danger right now? <a href="tel:911" className="font-medium text-support">Call 911</a>.</p>
    </section>
  );
}
