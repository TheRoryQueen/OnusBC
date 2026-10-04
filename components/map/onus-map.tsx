"use client";

import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre (about 1 MB) is imported lazily after hydration, so the page and its controls never wait for it;
// DotsPreview shows the dots from the server-rendered HTML in the meantime.
import type { GeoJSONSource, MapLayerMouseEvent, Map as MLMap } from "maplibre-gl";
import { DotsPreview, INITIAL_BOUNDS, initialPadding } from "./dots-preview";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { gapDisplay, isGraded } from "@/lib/grades";
import type { InstitutionSummary } from "@/lib/types";
import { useMapState } from "./map-state";
import { MAPPED, nearestSupport } from "@/lib/support";

const STYLE = {
  light: process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT ?? "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: process.env.NEXT_PUBLIC_MAP_STYLE_DARK ?? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

const CAMPUS_ZOOM = 13;

const isDark = () => document.documentElement.classList.contains("dark");
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// The selected school's route to its nearest sexual assault support (precomputed; no router is called).
function supportRoute(slug: string | null) {
  const near = slug ? nearestSupport(slug, null) : null;
  return {
    type: "FeatureCollection" as const,
    features: near ? [{ type: "Feature" as const, geometry: near.route.geometry, properties: { straight: near.straight } }] : [],
  };
}

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
    // Sexual assault support (official sources; see data/support-centres.json): small purple dots, and a purple
    // line from the selected school to its nearest support, drawn under the school dots.
    const support = token("--onus-support");
    if (!map.getSource("support-points")) map.addSource("support-points", { type: "geojson", data: {
      type: "FeatureCollection",
      features: MAPPED.map((e) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] }, properties: { id: e.id } })),
    } });
    if (!map.getSource("support-route")) map.addSource("support-route", { type: "geojson", data: supportRoute(latest.current.selected) });
    map.addLayer({ id: "support-route", type: "line", source: "support-route", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": support, "line-width": 3, "line-opacity": 0.9, "line-dasharray": ["case", ["get", "straight"], ["literal", [2, 2]], ["literal", [1, 0]]] } });
    map.addLayer({ id: "support-dot", type: "circle", source: "support-points",
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3.5, 10, 6], "circle-color": support, "circle-stroke-width": 1.5, "circle-stroke-color": token("--onus-page") } });
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
        fitBoundsOptions: { padding: initialPadding() },
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
      map.on("style.load", () => {
        // Globe when zoomed all the way out (zoom 2 and below), blending to flat by zoom 3.5. Every screen's
        // starting view of BC is zoom 4 or more, so it opens flat (and lines up with the dot preview).
        // Re-applied on each style load because a theme switch replaces the style.
        map.setProjection({ type: ["interpolate", ["linear"], ["zoom"], 2, "vertical-perspective", 3.5, "mercator"] });
        addLayers(map);
        setReady(true);
      });
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
        // Several schools under the tap (Vancouver, Victoria at the starting zoom): zoom in on them rather
        // than opening whichever dot happens to be on top.
        const near = map.queryRenderedFeatures([[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]], { layers: ["school-dot"] });
        const slugs = new Set(near.map((f) => f.properties?.slug));
        if (slugs.size > 1 && map.getZoom() < 11) {
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          const target = { center: e.lngLat, zoom: Math.min(map.getZoom() + 2.5, 12) };
          if (reduce) map.jumpTo(target); else map.easeTo({ ...target, duration: 600 });
          return;
        }
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

  // The purple route for the selected school.
  useEffect(() => {
    const src = mapRef.current?.getSource("support-route") as GeoJSONSource | undefined;
    if (ready && src) src.setData(supportRoute(selected));
  }, [selected, ready]);

  // Selection ring. Opening a school flies to it at about campus zoom (about 1 s); closing the panel eases
  // back out two zoom levels. With reduced motion, both jump straight there.
  const prevSelected = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer("school-selected")) map.setFilter("school-selected", ["==", ["get", "slug"], selected ?? ""]);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const s = schools.find((x) => x.slug === selected);
    if (s && selected !== prevSelected.current) {
      // Within 40 km, show the whole route to the nearest support; farther away, fly to the campus.
      const near = nearestSupport(s.slug, null);
      if (near && near.distanceKm <= 40) {
        const xs = near.route.geometry.coordinates.map((c) => c[0]), ys = near.route.geometry.coordinates.map((c) => c[1]);
        const padding = desktop ? { top: 240, bottom: 100, left: 480, right: 120 } : { top: 300, bottom: window.innerHeight * 0.5, left: 40, right: 40 };
        map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding, maxZoom: CAMPUS_ZOOM, duration: reduce ? 0 : 1000, essential: true });
      } else {
        const target = { center: [s.lng, s.lat] as [number, number], zoom: Math.max(map.getZoom(), CAMPUS_ZOOM), offset: (desktop ? [200, 0] : [0, -window.innerHeight * 0.22]) as [number, number] };
        if (reduce) map.jumpTo(target);
        else map.flyTo({ ...target, duration: 1000, essential: true });
      }
    } else if (!selected && prevSelected.current) {
      const zoom = Math.max(map.getZoom() - 2, 1);
      if (reduce) map.jumpTo({ zoom });
      else map.easeTo({ zoom, duration: 600 });
    }
    prevSelected.current = selected;
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
