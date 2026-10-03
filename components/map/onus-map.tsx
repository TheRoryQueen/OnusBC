"use client";

import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre (about 1 MB) is imported lazily after hydration, so the page and its controls never wait for it;
// DotsPreview shows the dots from the server-rendered HTML in the meantime.
import type { GeoJSONSource, MapLayerMouseEvent, Map as MLMap } from "maplibre-gl";
import { DotsPreview, INITIAL_BOUNDS, INITIAL_PADDING } from "./dots-preview";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { gapDisplay, isGraded } from "@/lib/grades";
import type { InstitutionSummary } from "@/lib/types";
import { useMapState } from "./map-state";

const STYLE = {
  light: process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT ?? "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: process.env.NEXT_PUBLIC_MAP_STYLE_DARK ?? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

const isDark = () => document.documentElement.classList.contains("dark");
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

type Hover = { school: InstitutionSummary; x: number; y: number } | null;

export function OnusMap() {
  const { schools, mode, typeFilter, pulse } = useMapState();
  const router = useRouter();
  const pathname = usePathname();
  const selected = pathname?.match(/^\/map\/([a-z0-9-]+)/)?.[1] ?? null;

  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dotsDrawn, setDotsDrawn] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const latest = useRef({ schools, mode, typeFilter, selected });
  useEffect(() => {
    latest.current = { schools, mode, typeFilter, selected };
  }, [schools, mode, typeFilter, selected]);

  // Feature collection from current state; colours come from the CSS tokens of the active theme.
  const features = useCallback(() => {
    const { schools, mode, typeFilter } = latest.current;
    return {
      type: "FeatureCollection" as const,
      features: schools
        .filter((s) => typeFilter === "all" || s.type === typeFilter)
        .map((s) => {
          const graded = isGraded(s.scores, s.policy_found);
          const gap = gapDisplay(s.scores?.gap_label ?? null, s.policy_found);
          const letter = mode === "paper" ? s.scores?.paper_letter : mode === "practice" ? s.scores?.practice_letter : null;
          const color = mode === "gap" ? token(gap.token) : s.policy_found ? token("--onus-text") : token("--onus-no-policy");
          return {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
            properties: { slug: s.slug, color, label: letter ?? "", graded, quiet: mode === "gap" && (gap.variant === "neutral") },
          };
        }),
    };
  }, []);

  const addLayers = useCallback((map: MLMap) => {
    // Reuse a font the basemap already ships, so labels never depend on a missing glyph set.
    const font = map.getStyle().layers.map((l) => (l as { layout?: Record<string, unknown> }).layout?.["text-font"]).find(Boolean) as string[] | undefined;
    const page = token("--onus-page");
    if (!map.getSource("schools")) map.addSource("schools", { type: "geojson", data: features() });
    map.addLayer({ id: "school-selected", type: "circle", source: "schools", filter: ["==", ["get", "slug"], latest.current.selected ?? ""],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 13, 10, 18], "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2.5, "circle-stroke-color": token("--onus-text") } });
    map.addLayer({ id: "school-pulse", type: "circle", source: "schools", filter: ["==", ["get", "slug"], ""],
      paint: { "circle-radius": 8, "circle-color": token("--onus-brand"), "circle-opacity": 0 } });
    map.addLayer({ id: "school-dot", type: "circle", source: "schools",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6.5, 10, 10],
        "circle-color": ["get", "color"],
        "circle-opacity": ["case", ["get", "quiet"], 0.45, 1],
        "circle-stroke-width": 2,
        "circle-stroke-color": page,
      } });
    if (font) {
      map.addLayer({ id: "school-letter", type: "symbol", source: "schools",
        layout: { "text-field": ["get", "label"], "text-font": font, "text-size": 13, "text-offset": [1.1, 0], "text-anchor": "left", "text-allow-overlap": true },
        paint: { "text-color": token("--onus-text"), "text-halo-color": page, "text-halo-width": 1.5 } });
    }
  }, [features]);

  // Create the map once.
  useEffect(() => {
    if (!el.current) return;
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !el.current) return;
      // Worker files are copied into public/maplibre by scripts/copy-maplibre-worker.mjs (predev, prebuild).
      maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      const map = new maplibre.Map({
        container: el.current,
        style: isDark() ? STYLE.dark : STYLE.light,
        bounds: INITIAL_BOUNDS,
        fitBoundsOptions: { padding: INITIAL_PADDING },
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;
      // Development only: lets tests and debugging inspect the map. Never in production.
      if (process.env.NODE_ENV !== "production") (window as unknown as { __onusMap?: MLMap }).__onusMap = map;
      map.on("error", (e) => { if (!map.isStyleLoaded() && String((e as unknown as { error?: Error }).error?.message ?? "").match(/style|fetch|Failed/i)) setFailed(true); });
      map.on("style.load", () => { addLayers(map); setReady(true); });
      // Performance marks for load-time measurement (scripts/measure-load.mts):
      //   onus-map-created  MapLibre constructed;  onus-style-loaded  basemap style parsed;
      //   onus-dots-visible the first frame with the school dots drawn;  onus-map-idle  every basemap tile drawn.
      const mark = (n: string) => { if (!performance.getEntriesByName(n).length) performance.mark(n); };
      mark("onus-map-created");
      map.once("style.load", () => mark("onus-style-loaded"));
      const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
        if (e.sourceId === "schools" && e.isSourceLoaded) { map.off("sourcedata", onData); map.once("render", () => { mark("onus-dots-visible"); setDotsDrawn(true); }); }
      };
      map.on("sourcedata", onData);
      map.once("idle", () => mark("onus-map-idle"));
      map.on("mousemove", "school-dot", (e: MapLayerMouseEvent) => {
        const slug = e.features?.[0]?.properties?.slug as string | undefined;
        const school = latest.current.schools.find((s) => s.slug === slug);
        map.getCanvas().style.cursor = "pointer";
        if (school) setHover({ school, x: e.point.x, y: e.point.y });
      });
      map.on("mouseleave", "school-dot", () => { map.getCanvas().style.cursor = ""; setHover(null); });
      map.on("click", "school-dot", (e: MapLayerMouseEvent) => {
        const slug = e.features?.[0]?.properties?.slug;
        if (slug) router.push(`/map/${slug}`, { scroll: false });
      });

      // Theme switch: swap basemap, then the layers are re-added with the new theme's tokens.
      const obs = new MutationObserver(() => {
        const want = isDark() ? STYLE.dark : STYLE.light;
        setReady(false);
        map.setStyle(want);
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      cleanup = () => { obs.disconnect(); map.remove(); mapRef.current = null; };
    })().catch(() => setFailed(true));
    return () => { cancelled = true; cleanup(); };
  }, [addLayers, router]);

  // Data, mode, filter changes.
  useEffect(() => {
    const src = mapRef.current?.getSource("schools") as GeoJSONSource | undefined;
    if (ready && src) src.setData(features());
  }, [schools, mode, typeFilter, ready, features]);

  // Selection ring, and bring the selected school into view beside the panel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer("school-selected")) map.setFilter("school-selected", ["==", ["get", "slug"], selected ?? ""]);
    const s = schools.find((x) => x.slug === selected);
    if (s) {
      const desktop = window.matchMedia("(min-width: 768px)").matches;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      map.easeTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 7), offset: desktop ? [200, 0] : [0, -window.innerHeight * 0.2], duration: reduce ? 0 : 700 });
    }
    // Only when the selection changes, not on every score update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready]);

  // One-time pulse when a school's Onus count goes up (a rating just landed).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !pulse || !map.getLayer("school-pulse")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    map.setFilter("school-pulse", ["==", ["get", "slug"], pulse.slug]);
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      map.setPaintProperty("school-pulse", "circle-radius", 8 + 18 * p);
      map.setPaintProperty("school-pulse", "circle-opacity", 0.45 * (1 - p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pulse, ready]);

  const hoverInfo = hover ? (() => {
    const s = hover.school;
    const gap = gapDisplay(s.scores?.gap_label ?? null, s.policy_found);
    if (mode === "gap" || !s.policy_found) return { text: gap.word, variant: gap.variant };
    if (!isGraded(s.scores, s.policy_found)) return { text: "Grading in progress", variant: "neutral" as const };
    const letter = mode === "paper" ? s.scores?.paper_letter : s.scores?.practice_letter;
    return { text: letter ? `${mode === "paper" ? "On paper" : "In practice"} ${letter}` : "Not enough ratings yet", variant: "neutral" as const };
  })() : null;

  return (
    <div className="absolute inset-0">
      {/* MapLibre's stylesheet sets position: relative on its container, so it gets an inner element that fills this one. */}
      <div className="absolute inset-0 bg-map-land" role="region" aria-label="Map of BC colleges and universities">
        <div ref={el} className="h-full w-full" />
      </div>
      {!ready && !failed && <div className="pointer-events-none absolute inset-0 bg-map-land" aria-hidden />}
      <DotsPreview schools={schools.filter((x) => typeFilter === "all" || x.type === typeFilter)} hidden={dotsDrawn} />
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-page p-6 text-center">
          <div>
            <p className="text-text">The map didn&apos;t load.</p>
            <button type="button" onClick={() => location.reload()} className="mt-3 rounded-full px-4 py-2 text-sm text-brand hover:bg-brand-tint">Try again</button>
          </div>
        </div>
      )}
      {hover && hoverInfo && (
        <div
          className="glass pointer-events-none absolute z-10 hidden -translate-x-1/2 rounded-2xl px-3 py-2 md:block"
          style={{ left: hover.x, top: hover.y - 14, transform: "translate(-50%, -100%)" }}
        >
          <p className="max-w-56 text-sm font-semibold text-text">{hover.school.name}</p>
          <Badge variant={hoverInfo.variant} className="mt-1">{hoverInfo.text}</Badge>
        </div>
      )}
    </div>
  );
}
