import type { Metadata } from "next";
import Link from "next/link";
import { reviewStat } from "@/lib/review-clock";
import { preconnect } from "react-dom";
import { FilterBar } from "@/components/map/filter-bar";
import { MapStateProvider } from "@/components/map/map-state";
import { OnusMap } from "@/components/map/onus-map";
import { listInstitutions } from "@/lib/data/institutions";

export const metadata: Metadata = { title: "Map · Onus" };

// The map lives in the layout so it stays mounted while the panel changes: /map, /map/sfu, back button.
export default async function MapLayout({ children }: LayoutProps<"/map">) {
  // Start DNS and TLS to the basemap servers while the page loads (style, then tiles).
  preconnect("https://basemaps.cartocdn.com", { crossOrigin: "anonymous" });
  preconnect("https://tiles.basemaps.cartocdn.com", { crossOrigin: "anonymous" });
  let schools: Awaited<ReturnType<typeof listInstitutions>> = [];
  let failed = false;
  // Computed from the dates printed in each published policy (data/review-dates.json), never hardcoded.
  const stat = reviewStat();
  try {
    schools = await listInstitutions();
  } catch {
    failed = true;
  }
  return (
    <MapStateProvider initial={schools}>
      <main className="relative min-h-[calc(100dvh-4rem)] flex-1 overflow-hidden">
        <OnusMap />
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 md:inset-x-auto md:right-4 md:top-4 md:w-auto">
          <FilterBar reviewLine={`${stat.old} of ${stat.total} published policies are more than three years old.`} />
          {failed && (
            <p className="glass pointer-events-auto mt-2 rounded-2xl px-3 py-2 text-sm text-text">
              Couldn&apos;t load the schools. <Link href="/map" className="text-brand">Try again</Link>
            </p>
          )}
        </div>
        {/* Crisis numbers on the map too (PRD: on every page). Wide screens: a caption along the bottom (the
            starting view keeps clear of it). Phones: a compact line above the map attribution. */}
        <p className="glass pointer-events-auto absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 rounded-full px-3 py-1.5 text-xs text-text-secondary lg:block">
          This map grades how schools handle sexual violence. In danger? <a href="tel:911" className="hit font-medium text-support">Call 911.</a> <Link href="/support" prefetch={false} className="hit font-medium text-support">Get help</Link>
        </p>
        <p className="glass pointer-events-auto absolute bottom-12 left-3 z-10 rounded-full px-3 py-1.5 text-xs text-text-secondary lg:hidden">
          In danger? <a href="tel:911" className="hit font-medium text-support">Call 911.</a> <Link href="/support" prefetch={false} className="hit font-medium text-support">Get help</Link>
        </p>
        {children}
      </main>
    </MapStateProvider>
  );
}
