// MapLibre 6 runs its tile work in an ES-module worker that imports ./maplibre-gl-shared.mjs. The bundler
// doesn't serve those files, so they are copied to public/maplibre/ before dev and build, always from the
// installed version. The map calls setWorkerUrl("/maplibre/maplibre-gl-worker.mjs").
import { copyFileSync, mkdirSync } from "node:fs";
const from = new URL("../node_modules/maplibre-gl/dist/", import.meta.url).pathname;
const to = new URL("../public/maplibre/", import.meta.url).pathname;
mkdirSync(to, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(from + f, to + f);
console.log("maplibre worker files copied to public/maplibre/");

// PDF.js (the in-app document viewer) runs in its own worker too; same approach, served from /pdfjs/.
const pdfFrom = new URL("../node_modules/pdfjs-dist/build/", import.meta.url).pathname;
const pdfTo = new URL("../public/pdfjs/", import.meta.url).pathname;
mkdirSync(pdfTo, { recursive: true });
copyFileSync(pdfFrom + "pdf.worker.min.mjs", pdfTo + "pdf.worker.min.mjs");
console.log("pdf.js worker copied to public/pdfjs/");
