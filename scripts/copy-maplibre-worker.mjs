// MapLibre 6 runs its tile work in an ES-module worker that imports ./maplibre-gl-shared.mjs. The bundler
// doesn't serve those files, so they are copied to public/maplibre/ before dev and build, always from the
// installed version. The map calls setWorkerUrl("/maplibre/maplibre-gl-worker.mjs").
import { copyFileSync, mkdirSync } from "node:fs";
const from = new URL("../node_modules/maplibre-gl/dist/", import.meta.url).pathname;
const to = new URL("../public/maplibre/", import.meta.url).pathname;
mkdirSync(to, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(from + f, to + f);
console.log("maplibre worker files copied to public/maplibre/");
