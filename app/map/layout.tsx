import type { Metadata } from "next";
import Link from "next/link";
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
          <FilterBar />
          {failed && (
            <p className="glass pointer-events-auto mt-2 rounded-2xl px-3 py-2 text-sm text-text">
              Couldn&apos;t load the schools. <Link href="/map" className="text-brand">Try again</Link>
            </p>
          )}
        </div>
        <p className="glass pointer-events-auto absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 rounded-full px-3 py-1.5 text-xs text-text-secondary lg:block">
          This map grades how schools handle sexual violence. <Link href="/support" prefetch={false} className="font-medium text-support">Get help</Link>
        </p>
        {children}
      </main>
    </MapStateProvider>
  );
}
