"use client";

import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre (about 1 MB) is imported lazily after hydration, so the page and its controls never wait for it;
// DotsPreview shows the dots from the server-rendered HTML in the meantime.
import type { GeoJSONSource, MapLayerMouseEvent, Map as MLMap } from "maplibre-gl";
import { DotsPreview, INITIAL_BOUNDS, initialPadding } from "./dots-preview";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { InstitutionSummary } from "@/lib/types";
import { useMapState } from "./map-state";
import { SupportSheet } from "./support-sheet";
import { MAPPED, nearestSupport } from "@/lib/support";
import { dotStyle } from "@/lib/map-style";
import { HOSPITALS, HOSPITAL_MIN_ZOOM, nearestHospital, nearestHospitals } from "@/lib/hospitals";
import { HospitalSheet } from "./hospital-sheet";

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

// The selected school's route to its nearest hospital emergency department (precomputed, like the support route).
function hospitalRoute(key: string | null) {
  const near = nearestHospital(key);
  return {
    type: "FeatureCollection" as const,
    features: near ? [{ type: "Feature" as const, geometry: near.route.geometry, properties: {} }] : [],
  };
}
// Hospitals shown at every zoom while a school is selected: the three nearest, and the one its route goes to.
const hospitalsNear = (s: InstitutionSummary | undefined, key: string | null) => {
  if (!s) return [];
  const ids = nearestHospitals(s);
  const h = nearestHospital(key)?.hospital.id;
  return h && !ids.includes(h) ? [...ids, h] : ids;
};

type Hover = { school: InstitutionSummary; x: number; y: number } | null;

// The card shown when a pointer rests on a school dot (wide screens): name and On paper grade only. It opens
// above the dot, or below, left or right of it, whichever has room, and never under the school panel (which
// covers the left 432 px when open). It is drawn above the floating controls.
const GAP = 14, EDGE = 8, PANEL_RIGHT = 432;
function HoverCard({ hover, panelOpen }: { hover: NonNullable<Hover>; panelOpen: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Placed straight on the element after it is measured (before paint), so it never flashes in the wrong spot.
  useLayoutEffect(() => {
    const card = ref.current, box = card?.parentElement;
    if (!card || !box) return;
    const W = box.clientWidth, H = box.clientHeight, w = card.offsetWidth, h = card.offsetHeight;
    const minX = panelOpen ? PANEL_RIGHT : EDGE;
    // The dot itself is under the panel: no card.
    if (hover.x < minX) { card.style.visibility = "hidden"; return; }
    const clampX = (x: number) => Math.min(Math.max(x, minX), W - w - EDGE);
    const clampY = (y: number) => Math.min(Math.max(y, EDGE), H - h - EDGE);
    const tries = [
      { left: clampX(hover.x - w / 2), top: hover.y - GAP - h, ok: hover.y - GAP - h >= EDGE },
      { left: clampX(hover.x - w / 2), top: hover.y + GAP, ok: hover.y + GAP + h <= H - EDGE },
      { left: hover.x + GAP, top: clampY(hover.y - h / 2), ok: hover.x + GAP + w <= W - EDGE },
      { left: hover.x - GAP - w, top: clampY(hover.y - h / 2), ok: hover.x - GAP - w >= minX },
    ];
    const pick = tries.find((t) => t.ok) ?? tries[0];
    Object.assign(card.style, { left: `${pick.left}px`, top: `${pick.top}px`, visibility: "visible" });
  }, [hover, panelOpen]);
  return (
    <div ref={ref} aria-hidden
      className="glass pointer-events-none absolute z-[15] hidden w-max max-w-60 rounded-2xl px-3 py-2 md:block"
      style={{ left: 0, top: 0, visibility: "hidden" }}>
      <p className="text-sm font-semibold text-text">{hover.school.name}</p>
      <Badge variant="neutral" className="mt-1">{dotStyle(hover.school).label}</Badge>
    </div>
  );
}

export function OnusMap() {
  const { schools, pulse, setSupportId, setHospitalId } = useMapState();
  const router = useRouter();
  const pathname = usePathname();
  const selected = pathname?.match(/^\/map\/([a-z0-9-]+)/)?.[1] ?? null;

  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dotsDrawn, setDotsDrawn] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const latest = useRef({ schools, selected });
  useEffect(() => {
    latest.current = { schools, selected };
  }, [schools, selected]);

  // Feature collection from current state; colours come from the CSS tokens of the active theme.
  const features = useCallback(() => {
    const { schools } = latest.current;
    return {
      type: "FeatureCollection" as const,
      features: schools
        .map((s) => {
          // Fill = On paper grade; ring = the gap, once there are enough real ratings (lib/map-style.ts).
          const st = dotStyle(s);
          return {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
            properties: {
              slug: s.slug,
              fill: st.hollow ? token("--onus-page") : token(st.fill!),
              outline: token(st.hollow ? "--onus-no-policy" : "--onus-text"),
              outlineWidth: st.hollow ? 2 : 1.25,
              ring: !!st.ring,
              ringColor: st.ring ? token(st.ring.token) : "rgba(0,0,0,0)",
              ringWidth: st.ring?.width ?? 0,
              // Distance from the dot's edge to the ring: none when touching, 3 px when detached.
              ringOffset: st.ring ? 1.25 + (st.ring.detached ? 3 : 0) : 0,
            },
          };
        }),
    };
  }, []);

  const addLayers = useCallback((map: MLMap) => {
    if (!map.getSource("schools")) map.addSource("schools", { type: "geojson", data: features() });
    // Sexual assault support (official sources; see data/support-centres.json): small purple dots, and a purple
    // line from the selected school to its nearest support, drawn under the school dots.
    const support = token("--onus-support");
    if (!map.getSource("support-points")) map.addSource("support-points", { type: "geojson", data: {
      type: "FeatureCollection",
      features: MAPPED.map((e) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] }, properties: { id: e.id } })),
    } });
    if (!map.getSource("support-route")) map.addSource("support-route", { type: "geojson", data: supportRoute(latest.current.selected) });
    // The route to the nearest hospital emergency department: an ink dotted line, under the purple one.
    if (!map.getSource("hospital-route")) map.addSource("hospital-route", { type: "geojson", data: hospitalRoute(latest.current.selected) });
    map.addLayer({ id: "hospital-route-casing", type: "line", source: "hospital-route", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": token("--onus-page"), "line-width": 6 } });
    map.addLayer({ id: "hospital-route", type: "line", source: "hospital-route", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": token("--onus-text"), "line-width": 3, "line-dasharray": [0.1, 2] } });
    map.addLayer({ id: "support-route-casing", type: "line", source: "support-route", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": token("--onus-page"), "line-width": 7 } });
    map.addLayer({ id: "support-route", type: "line", source: "support-route", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": support, "line-width": 4, "line-dasharray": ["case", ["get", "straight"], ["literal", [2, 2]], ["literal", [1, 0]]] } });
    // Hospitals (DataBC): ink crosses, a different shape from the purple support dots. Shown from zoom 7, or
    // the three nearest the selected school at any zoom.
    if (!map.hasImage("hospital-cross")) {
      const px = 2 * (window.devicePixelRatio > 1 ? 2 : 1), n = 12 * px;
      const c = document.createElement("canvas"); c.width = c.height = n;
      const g = c.getContext("2d")!;
      const arm = 4 * px, edge = 1 * px;
      g.fillStyle = token("--onus-page");
      g.fillRect((n - arm) / 2 - edge, 0, arm + 2 * edge, n); g.fillRect(0, (n - arm) / 2 - edge, n, arm + 2 * edge);
      g.fillStyle = token("--onus-text");
      g.fillRect((n - arm) / 2, edge, arm, n - 2 * edge); g.fillRect(edge, (n - arm) / 2, n - 2 * edge, arm);
      map.addImage("hospital-cross", g.getImageData(0, 0, n, n), { pixelRatio: px });
    }
    if (!map.getSource("hospitals")) map.addSource("hospitals", { type: "geojson", data: {
      type: "FeatureCollection",
      features: HOSPITALS.map((h) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [h.lng, h.lat] }, properties: { id: h.id } })),
    } });
    const sel = HOSPITALS.length && latest.current.selected ? latest.current.schools.find((x) => x.slug === latest.current.selected) : undefined;
    map.addLayer({ id: "hospital", type: "symbol", source: "hospitals", minzoom: HOSPITAL_MIN_ZOOM,
      layout: { "icon-image": "hospital-cross", "icon-allow-overlap": true, "icon-ignore-placement": true } });
    map.addLayer({ id: "hospital-near", type: "symbol", source: "hospitals", maxzoom: HOSPITAL_MIN_ZOOM,
      filter: ["in", ["get", "id"], ["literal", hospitalsNear(sel, latest.current.selected)]],
      layout: { "icon-image": "hospital-cross", "icon-allow-overlap": true, "icon-ignore-placement": true } });
    map.addLayer({ id: "support-dot", type: "circle", source: "support-points",
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3.5, 10, 6], "circle-color": support, "circle-stroke-width": 1.5, "circle-stroke-color": token("--onus-page") } });
    map.addLayer({ id: "school-selected", type: "circle", source: "schools", filter: ["==", ["get", "slug"], latest.current.selected ?? ""],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 14, 10, 17], "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2.5, "circle-stroke-color": token("--onus-text") } });
    map.addLayer({ id: "school-ring", type: "circle", source: "schools", filter: ["get", "ring"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["+", 4.5, ["get", "ringOffset"]], 10, ["+", 7.5, ["get", "ringOffset"]]],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": ["get", "ringWidth"],
        "circle-stroke-color": ["get", "ringColor"],
      } });
    map.addLayer({ id: "school-pulse", type: "circle", source: "schools", filter: ["==", ["get", "slug"], ""],
      paint: { "circle-radius": 8, "circle-color": token("--onus-brand"), "circle-opacity": 0 } });
    map.addLayer({ id: "school-dot", type: "circle", source: "schools",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4.5, 10, 7.5],
        "circle-color": ["get", "fill"],
        "circle-stroke-width": ["get", "outlineWidth"],
        "circle-stroke-color": ["get", "outline"],
      } });
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
      // Purple dots open the support info sheet; hospital crosses open the hospital popup.
      map.on("click", "support-dot", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) { setHospitalId(null); setSupportId(id); }
      });
      for (const layer of ["hospital", "hospital-near"]) {
        map.on("click", layer, (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) { setSupportId(null); setHospitalId(id); }
        });
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      map.on("mouseenter", "support-dot", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "support-dot", () => { map.getCanvas().style.cursor = ""; });
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
  }, [addLayers, router, setSupportId, setHospitalId]);

  // Score changes (realtime).
  useEffect(() => {
    const src = mapRef.current?.getSource("schools") as GeoJSONSource | undefined;
    if (ready && src) src.setData(features());
  }, [schools, ready, features]);

  // The purple route for the selected school, drawn out from the campus like a directions app (about 1.2 s,
  // after the camera move starts); with reduced motion it appears at once.
  useEffect(() => {
    const src = mapRef.current?.getSource("support-route") as GeoJSONSource | undefined;
    if (!ready || !src) return;
    const s = latest.current.schools.find((x) => x.slug === selected);
    if (mapRef.current?.getLayer("hospital-near")) mapRef.current.setFilter("hospital-near", ["in", ["get", "id"], ["literal", hospitalsNear(s, selected)]]);
    (mapRef.current?.getSource("hospital-route") as GeoJSONSource | undefined)?.setData(hospitalRoute(selected));
    const full = supportRoute(selected);
    const line = full.features[0];
    if (!line || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { src.setData(full); return; }
    const pts = line.geometry.coordinates;
    const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    const total = seg.reduce((a, b) => a + b, 0) || 1;
    const partial = (t: number) => {
      let left = t * total;
      const out: [number, number][] = [pts[0]];
      for (let i = 0; i < seg.length; i++) {
        if (left >= seg[i]) { out.push(pts[i + 1]); left -= seg[i]; continue; }
        const f = seg[i] ? left / seg[i] : 0;
        out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]);
        break;
      }
      return { ...full, features: [{ ...line, geometry: { ...line.geometry, coordinates: out.length > 1 ? out : [pts[0], pts[0]] } }] };
    };
    src.setData(partial(0));
    let raf = 0;
    const start = performance.now() + 250;
    const step = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - start) / 1200));
      src.setData(partial(1 - Math.pow(1 - p, 3))); // ease out
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
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
      // Only when that still means zooming in to street level (zoom 11+): on a phone the space between the
      // filter bar and the sheet is small, and fitting a long route there would zoom out instead.
      // Both routes (support and the nearest hospital) are framed together when they are close by.
      const near = nearestSupport(s.slug, null);
      const hosp = nearestHospital(s.slug);
      const pts = [...(near?.route.geometry.coordinates ?? []), ...(hosp && hosp.distanceKm <= 40 ? hosp.route.geometry.coordinates : [])];
      const xs = pts.map((c) => c[0]), ys = pts.map((c) => c[1]);
      const padding = desktop ? { top: 240, bottom: 100, left: 480, right: 120 } : { top: 170, bottom: window.innerHeight * 0.45, left: 32, right: 32 };
      const fit = near && near.distanceKm <= 40
        ? map.cameraForBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding, maxZoom: CAMPUS_ZOOM })
        : undefined;
      if (fit && (fit.zoom ?? 0) >= 11) {
        if (reduce) map.jumpTo(fit);
        else map.flyTo({ ...fit, duration: 1000, essential: true });
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

  return (
    <div className="absolute inset-0">
      {/* MapLibre's stylesheet sets position: relative on its container, so it gets an inner element that fills this one. */}
      <div className="absolute inset-0 bg-map-land" role="region" aria-label="Map of BC colleges and universities">
        <div ref={el} className="h-full w-full" />
      </div>
      {!ready && !failed && <div className="pointer-events-none absolute inset-0 bg-map-land" aria-hidden />}
      <SupportSheet />
      <HospitalSheet />
      <DotsPreview schools={schools} hidden={dotsDrawn} />
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-page p-6 text-center">
          <div>
            <p className="text-text">The map didn&apos;t load.</p>
            <button type="button" onClick={() => location.reload()} className="mt-3 rounded-full px-4 py-2 text-sm text-brand hover:bg-brand-tint">Try again</button>
          </div>
        </div>
      )}
      {hover && <HoverCard hover={hover} panelOpen={!!selected} />}
    </div>
  );
}
