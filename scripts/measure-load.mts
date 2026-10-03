// Measures real load times against a running server (production: npm run build && npm start).
// For each page, 3 cold loads (fresh browser context, empty cache) under two network profiles:
//   - unthrottled localhost (best case)
//   - "phone on 4G": CPU slowed 4x, ~9 Mbps down, 170 ms latency (closer to a judge on venue Wi-Fi)
// Reports first contentful paint, and for /map the time until the school dots are drawn
// (performance mark "onus-dots-visible"), plus JavaScript transferred.
// Usage: npx tsx scripts/measure-load.mts [base-url]
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PROFILES = {
  unthrottled: null,
  "phone on 4G": { cpu: 4, latency: 170, down: (9 * 1024 * 1024) / 8, up: (3 * 1024 * 1024) / 8 },
} as const;

const stages: Record<string, { created: number; style: number; dots: number; idle: number }[]> = {};
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const browser = await chromium.launch();
for (const [profile, p] of Object.entries(PROFILES)) {
  for (const path of ["/", "/map"]) {
    const fcp: number[] = [], dots: number[] = [], js: number[] = [];
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      if (p) {
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: p.latency, downloadThroughput: p.down, uploadThroughput: p.up });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
      }
      let jsBytes = 0;
      page.on("response", async (r) => {
        if (r.request().resourceType() === "script" && r.url().startsWith(BASE)) {
          const len = Number(r.headers()["content-length"] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
          jsBytes += len;
        }
      });
      await page.goto(BASE + path, { waitUntil: "load", timeout: 90000 });
      if (path === "/map") await page.waitForFunction(() => performance.getEntriesByName("onus-dots-visible").length > 0, null, { timeout: 90000 }).catch(() => {});
      if (path === "/map") await page.waitForFunction(() => performance.getEntriesByName("onus-map-idle").length > 0, null, { timeout: 90000 }).catch(() => {});
      const names = ["first-contentful-paint", "onus-dots-visible", "onus-map-created", "onus-style-loaded", "onus-map-idle"];
      const [fcpT, dotsT, createdT, styleT, idleT] = await page.evaluate((names) => names.map((n) => performance.getEntriesByName(n)[0]?.startTime ?? -1), names);
      const t = { fcp: fcpT, dots: dotsT, created: createdT, style: styleT, idle: idleT };
      fcp.push(t.fcp); dots.push(t.dots); js.push(jsBytes);
      if (path === "/map") (stages[profile] ??= []).push(t);
      await ctx.close();
    }
    const ms = (x: number) => (x < 0 ? "n/a" : `${(x / 1000).toFixed(2)} s`);
    console.log(`${profile.padEnd(12)} ${path.padEnd(5)} first paint ${ms(median(fcp))}` + (path === "/map" ? `   dots visible ${ms(median(dots))}` : "") + `   JS ${(median(js) / 1024).toFixed(0)} KB (${fcp.map((x) => (x / 1000).toFixed(2)).join(", ")} | ${path === "/map" ? dots.map((x) => (x / 1000).toFixed(2)).join(", ") : "-"})`);
  }
}
for (const [profile, runs] of Object.entries(stages)) {
  const m = (k: "created" | "style" | "dots" | "idle") => (median(runs.map((r) => r[k])) / 1000).toFixed(2);
  console.log(`${profile.padEnd(12)} /map stages: MapLibre created ${m("created")} s, style loaded ${m("style")} s, dots visible ${m("dots")} s, all tiles ${m("idle")} s`);
}
await browser.close();
