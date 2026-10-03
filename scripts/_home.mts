import { chromium } from "@playwright/test";
// Usage: npx tsx scripts/_home.mts <name> [css selector to scroll to] [wait ms] [extra scroll px]
const [out = "hero", sel, wait = "3500", extra = "0"] = process.argv.slice(2);
const b = await chromium.launch();
for (const [w, h] of [[390, 844], [1440, 900]]) for (const scheme of ["light", "dark"] as const) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme })).newPage();
  const errs: string[] = []; page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 160)));
  await page.goto("http://localhost:3000/", { waitUntil: "load" });
  if (sel) { await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.evaluate((y) => window.scrollBy(0, y), Number(extra)); }
  await page.waitForTimeout(Number(wait));
  await page.screenshot({ path: `screenshots/home-${out}-${w}-${scheme}.png` });
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (errs.length || over) console.log(w, scheme, over ? "HORIZONTAL OVERFLOW" : "", errs);
}
await b.close(); console.log("ok");
