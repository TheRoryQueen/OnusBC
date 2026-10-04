"use client";

import { useEffect, useRef } from "react";
import { ExternalLink, Phone, X } from "lucide-react";
import { HOSPITALS_SOURCE, hospitalById } from "@/lib/hospitals";
import { telHref } from "@/lib/tel";
import { useMapState } from "./map-state";

// Popup for a hospital marker: name, address, phone and the health authority's emergency department status
// page, from the official DataBC hospitals dataset. No hours are claimed.
export function HospitalSheet() {
  const { hospitalId, setHospitalId } = useMapState();
  const h = hospitalById(hospitalId);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!h) return;
    close.current?.focus();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setHospitalId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h, setHospitalId]);
  if (!h) return null;
  return (
    <section role="dialog" aria-modal="false" aria-labelledby="hospital-sheet-title"
      className="glass pointer-events-auto absolute inset-x-3 bottom-3 z-30 rounded-[28px] p-5 md:inset-x-auto md:bottom-auto md:right-4 md:top-[136px] md:w-[380px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-text-secondary">Hospital · {h.health_authority}</p>
          <h2 id="hospital-sheet-title" className="mt-1 text-[17px] font-semibold leading-snug text-text">{h.name}</h2>
        </div>
        <button ref={close} type="button" onClick={() => setHospitalId(null)} aria-label="Close hospital details"
          className="hit grid size-8 shrink-0 place-items-center rounded-full bg-hairline/70 text-text-secondary hover:text-text">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-[14px] text-text">{h.address}</p>
      <div className="mt-3 grid gap-2">
        {h.phone && (
          <a href={telHref(h.phone)} className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-hairline/60 px-4 text-[15px] font-medium text-text">
            <span className="flex items-center gap-2"><Phone className="size-4" aria-hidden />Phone</span><span className="tabular-nums">{h.phone}</span>
          </a>
        )}
        <a href={h.status_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-hairline/60 px-4 text-sm font-medium text-text">
          <ExternalLink className="size-4" aria-hidden />Emergency department status
        </a>
      </div>
      <p className="mt-3 text-[12px] text-text-secondary">
        In danger right now? <a href="tel:911" className="font-medium text-support">Call 911</a>. Hospital data: <a href={HOSPITALS_SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline decoration-current/35 underline-offset-2 hover:decoration-current">DataBC, Hospitals in BC</a>, updated {HOSPITALS_SOURCE.updated}.
      </p>
    </section>
  );
}
