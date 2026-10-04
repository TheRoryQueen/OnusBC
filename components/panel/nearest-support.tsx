"use client";

import { Navigation, Phone } from "lucide-react";
import { directionsUrl, formatDrive, nearestSupport } from "@/lib/support";
import { useMapState } from "@/components/map/map-state";
import { telHref } from "@/lib/tel";

// "Nearest support" in a school's panel: the closest sexual assault support that serves the campus's city,
// by road (precomputed; the purple line on the map), with call and directions links.
export function NearestSupport({ slug, city, from }: { slug: string; city: string | null; from: { lat: number; lng: number } }) {
  const { setSupportId } = useMapState();
  const near = nearestSupport(slug, city);
  if (!near) return null;
  const { entry, distanceKm, minutes, straight, phoneLines } = near;
  const kind = entry.type === "hospital_24h" ? "Hospital sexual assault care, 24 hours" : "Community sexual assault support";
  const tel = telHref(entry.phone);
  return (
    <section className="mt-6" aria-labelledby="support-heading">
      <h3 id="support-heading" className="px-1 text-[13px] text-text-secondary">Nearest support</h3>
      <div className="mt-2 rounded-2xl bg-hairline/40 px-4 py-3">
        <p className="flex items-center gap-2 text-[12px] font-medium text-support"><span className="size-2 rounded-full bg-support" aria-hidden />{kind}</p>
        <button type="button" onClick={() => setSupportId(entry.id)} className="mt-1 text-left text-[15px] font-medium leading-snug text-text underline decoration-hairline underline-offset-4 hover:decoration-text">{entry.name}</button>
        <p className="mt-1 text-[14px] text-text-secondary">
          {distanceKm.toLocaleString("en-CA")} km {straight ? "straight-line distance" : `by road, about ${formatDrive(minutes!)} by car`}
          <span aria-hidden> · </span><a href={tel} className="whitespace-nowrap text-text tabular-nums underline-offset-2 hover:underline">{entry.phone}</a>
        </p>
        {entry.hours && <p className="mt-1 text-[13px] text-text-secondary">{entry.hours}</p>}
        <p className="mt-1 text-[13px] text-text-secondary">{entry.serves}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={tel} aria-label={`Call ${entry.name}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-support/12 px-4 text-sm font-medium text-support">
            <Phone className="size-4" aria-hidden />Call
          </a>
          <a href={directionsUrl(entry, from)} aria-label={`Directions to ${entry.name}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-hairline/60 px-4 text-sm font-medium text-text">
            <Navigation className="size-4" aria-hidden />Directions
          </a>
        </div>
      </div>
      {phoneLines.length > 0 && (
        <ul className="mt-2 overflow-hidden rounded-2xl bg-hairline/40">
          {phoneLines.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
              <span className="text-[14px] leading-snug text-text">{p.name}<span className="block text-[12.5px] text-text-secondary">{p.hours ? `${p.hours}, by phone` : "By phone"}</span></span>
              <a href={telHref(p.phone)} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-support/12 px-4 text-sm font-medium tabular-nums text-support">{p.phone}</a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 px-1 text-[12px] text-text-secondary">
        <a href={entry.source_url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">Source</a>. Distance and drive time © OpenStreetMap contributors, computed with OSRM. Directions open Google Maps.
      </p>
    </section>
  );
}
