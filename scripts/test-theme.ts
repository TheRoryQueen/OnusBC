// Milestone 1 check: the theme toggle flips the theme, remembers it, and the circle reveal runs.
import { chromium } from "@playwright/test";

const base = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

async function main() {
  const browser = await chromium.launch();

  // System light, then toggle to dark.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  check("first load follows system light", !(await page.evaluate(() => document.documentElement.classList.contains("dark"))));

  // Record whether a view transition with a clip-path circle animation runs.
  await page.evaluate(() => {
    const w = window as unknown as { __clip: string[] };
    w.__clip = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const kf = JSON.stringify(keyframes);
      if (kf.includes("circle(")) w.__clip.push(`${kf} ${JSON.stringify(options)}`);
      return orig.call(this, keyframes, options);
    };
  });
  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await page.waitForTimeout(700);
  check("toggle switches to dark", await page.evaluate(() => document.documentElement.classList.contains("dark")));
  const clip = await page.evaluate(() => (window as unknown as { __clip: string[] }).__clip);
  check("circle reveal animation ran", clip.length === 1, clip[0]?.slice(0, 120));
  check("reveal is 450ms ease-out", clip[0]?.includes('"duration":450') && clip[0]?.includes('"easing":"ease-out"'));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("dark page token applied (#0E1116)", bg === "rgb(14, 17, 22)", bg);
  check("choice stored", (await page.evaluate(() => localStorage.getItem("theme"))) === "dark");

  await page.reload({ waitUntil: "networkidle" });
  check("choice remembered after reload, overriding system light", await page.evaluate(() => document.documentElement.classList.contains("dark")));

  await page.getByRole("button", { name: /switch to light mode/i }).click();
  await page.waitForTimeout(700);
  const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("toggle back to light (#F7F6F3)", bgLight === "rgb(247, 246, 243)", bgLight);
  await ctx.close();

  // System dark, first load, no stored choice.
  const ctxDark = await browser.newContext({ colorScheme: "dark" });
  const p2 = await ctxDark.newPage();
  await p2.goto(base, { waitUntil: "networkidle" });
  check("first load follows system dark", await p2.evaluate(() => document.documentElement.classList.contains("dark")));
  await ctxDark.close();

  // Reduced motion: switch instantly, no circle.
  const ctxRm = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce" });
  const p3 = await ctxRm.newPage();
  await p3.goto(base, { waitUntil: "networkidle" });
  await p3.evaluate(() => {
    const w = window as unknown as { __vt: number };
    w.__vt = 0;
    const orig = document.startViewTransition?.bind(document);
    if (orig) document.startViewTransition = ((cb: () => void) => { w.__vt++; return orig(cb); }) as typeof document.startViewTransition;
  });
  await p3.getByRole("button", { name: /switch to dark mode/i }).click();
  check("reduced motion: switches", await p3.evaluate(() => document.documentElement.classList.contains("dark")));
  check("reduced motion: no view transition", (await p3.evaluate(() => (window as unknown as { __vt: number }).__vt)) === 0);
  await ctxRm.close();

  // Storage blocked: page still loads and toggle still works.
  const ctxNoStore = await browser.newContext({ colorScheme: "light" });
  await ctxNoStore.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  });
  const p4 = await ctxNoStore.newPage();
  const errs: string[] = [];
  p4.on("pageerror", (e) => errs.push(e.message));
  await p4.goto(base, { waitUntil: "networkidle" });
  await p4.getByRole("button", { name: /switch to dark mode/i }).click();
  await p4.waitForTimeout(700);
  check("storage blocked: toggle still works, no page errors", (await p4.evaluate(() => document.documentElement.classList.contains("dark"))) && errs.length === 0, errs.join(" | "));
  await ctxNoStore.close();

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
  process.exit(failed ? 1 : 0);
}
main();
