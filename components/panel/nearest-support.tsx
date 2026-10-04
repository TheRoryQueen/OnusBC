"use client";

import { ExternalLink, Navigation, Phone } from "lucide-react";
import { useMapState } from "@/components/map/map-state";
import { ED_NOTE, campusSupport, directionsUrl, formatDrive, type Option, type SupportEntry } from "@/lib/support";
import { telHref } from "@/lib/tel";

// Sexual assault support in a school's panel (order explained in lib/support.ts): the nearest emergency
// department first where hospital sexual assault care is over 100 km away, then local phone lines, then the
// nearest support by road (the purple line), then other options nearby.

const distance = (o: Option) =>
  `${o.distanceKm.toLocaleString("en-CA")} km ${o.straight ? "straight-line distance" : `by road, about ${formatDrive(o.minutes!)} by car`}`;

function Card({ o, from, children }: { o: Option; from: { lat: number; lng: number }; children?: React.ReactNode }) {
  const { setSupportId } = useMapState();
  const e = o.entry;
  const tel = telHref(e.phone);
  return (
    <div className="rounded-2xl bg-hairline/40 px-4 py-3">
      <p className="flex items-center gap-2 text-[12px] font-medium text-support"><span className="size-2 rounded-full bg-support" aria-hidden />{e.label}</p>
      {e.type === "hospital_ed"
        ? <p className="mt-1 text-[15px] font-medium leading-snug text-text">{e.name}</p>
        : <button type="button" onClick={() => setSupportId(e.id)} className="hit mt-1 text-left text-[15px] font-medium leading-snug text-text underline decoration-hairline underline-offset-4 hover:decoration-text">{e.name}</button>}
      {e.address && <p className="mt-1 text-[13px] text-text-secondary">{e.address}</p>}
      <p className="mt-1 text-[14px] text-text-secondary">
        {distance(o)}<span aria-hidden> · </span><a href={tel} className="whitespace-nowrap text-text tabular-nums underline decoration-current/35 underline-offset-2 hover:decoration-current">{e.phone}</a>
      </p>
      {e.hours && <p className="mt-1 text-[13px] text-text-secondary">{e.hours}</p>}
      {e.type !== "hospital_ed" && <p className="mt-1 text-[13px] text-text-secondary">{e.serves}</p>}
      {children}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={tel} aria-label={`Call ${e.name}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-support/12 px-4 text-sm font-medium text-support">
          <Phone className="size-4" aria-hidden />Call
        </a>
        <a href={directionsUrl(e, from)} aria-label={`Directions to ${e.name}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-hairline/60 px-4 text-sm font-medium text-text">
          <Navigation className="size-4" aria-hidden />Directions
        </a>
        {e.status_url && (
          <a href={e.status_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-hairline/60 px-4 text-sm font-medium text-text">
            <ExternalLink className="size-4" aria-hidden />Emergency department status
          </a>
        )}
      </div>
      <p className="mt-2 text-[12px] text-text-secondary"><a href={e.source_url} target="_blank" rel="noopener noreferrer" className="underline decoration-current/35 underline-offset-2 hover:decoration-current">Source</a></p>
    </div>
  );
}

function LocalLine({ e }: { e: SupportEntry }) {
  const note = [e.label, e.hours].filter(Boolean).join(". ");
  return (
    <li className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
      <span className="text-[14px] leading-snug text-text">
        {e.name}
        <span className="block text-[12.5px] text-text-secondary">{note}{e.address ? `. ${e.address}` : ""}. <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="underline decoration-current/35 underline-offset-2 hover:decoration-current">Source</a></span>
      </span>
      <a href={telHref(e.phone)} aria-label={`Call ${e.name}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-support/12 px-4 text-sm font-medium tabular-nums text-support">{e.phone}</a>
    </li>
  );
}

export function NearestSupport({ slug, city, from }: { slug: string; city: string | null; from: { lat: number; lng: number } }) {
  const s = campusSupport(slug, city);
  if (!s.ed && !s.nearest && !s.local.length) return null;
  return (
    <section className="mt-6" aria-labelledby="support-heading">
      <h3 id="support-heading" className="px-1 text-[13px] text-text-secondary">Nearest support</h3>
      <div className="mt-2 space-y-2">
        {s.ed && (
          <Card o={s.ed} from={from}>
            <p className="mt-2 text-[13px] leading-relaxed text-text">
              The nearest hospital sexual assault service is more than 100 km away. Any emergency department can give medical care: &ldquo;{ED_NOTE.quote}&rdquo;{" "}
              <a href={ED_NOTE.url} target="_blank" rel="noopener noreferrer" className="text-text-secondary underline decoration-current/35 underline-offset-2 hover:decoration-current">{ED_NOTE.publisher}</a>
            </p>
          </Card>
        )}
        {s.local.length > 0 && <ul className="overflow-hidden rounded-2xl bg-hairline/40">{s.local.map((e) => <LocalLine key={e.id} e={e} />)}</ul>}
        {s.nearest && <Card o={s.nearest} from={from} />}
        {s.others.length > 0 && (
          <div className="px-1">
            <p className="text-[12px] text-text-secondary">Also nearby</p>
            <ul className="mt-1 space-y-1">
              {s.others.map((o) => (
                <li key={o.entry.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-text">{o.entry.name}<span className="block text-text-secondary">{o.entry.label}, {distance(o)}</span></span>
                  <a href={telHref(o.entry.phone)} aria-label={`Call ${o.entry.name}`} className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 font-medium tabular-nums text-support">{o.entry.phone}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className="mt-2 px-1 text-[12px] text-text-secondary">Distance and drive time © OpenStreetMap contributors, computed with OSRM. Directions open Google Maps.</p>
    </section>
  );
}
