// The nav: pinned at the top on every page; the same destinations on desktop (tabs) and phones (the menu);
// the wordmark goes to the homepage; the current tab has aria-current and an underline; keyboard focus moves the
// highlight; Privacy and Sources in the footer and at the bottom of the phone menu; the phone menu (labelled
// button, focus trapped, closes on Escape, on a tap outside, when a link is chosen and when the window is
// widened past the breakpoint).
// Needs the dev server. Usage: npm run test:nav
import { chromium } from "@playwright/test";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
const browser = await chromium.launch();
try {
  // Desktop: links in a row, no menu button, the nav stays at the top as the page scrolls.
  {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    for (const path of ["/", "/signin", "/support", "/how-it-works"]) {
      const res = await page.goto(BASE + path, { waitUntil: "load" });
      if (!res || res.status() >= 400) continue;
      await page.mouse.wheel(0, 2500); await page.waitForTimeout(400);
      const box = await page.locator("header").first().boundingBox();
      check(`desktop ${path}: the nav stays fixed at the top after scrolling`, !!box && Math.abs(box.y) < 1, `y=${box?.y}`);
    }
    check("desktop: no menu button", !(await page.getByRole("button", { name: "Open menu" }).isVisible()));
    const main = page.getByRole("navigation", { name: "Main" });
    const desktopLabels = (await main.getByRole("link").allInnerTexts()).map((t) => t.trim());
    check("desktop: Map, Rate your school, How it works, Get support, Sign in", JSON.stringify(desktopLabels) === JSON.stringify(["Map", "Rate your school", "How it works", "Get support", "Sign in"]), desktopLabels.join(", "));
    check("the Onus wordmark goes to the homepage", (await page.locator("header").getByRole("link", { name: /^Onus/ }).getAttribute("href")) === "/");
    for (const [path, label] of [["/how-it-works", "How it works"], ["/support", "Get support"], ["/map", "Map"], ["/map/sfu", "Map"]] as const) {
      await page.goto(BASE + path, { waitUntil: "load" });
      const cur = await main.locator('[aria-current="page"]').allInnerTexts();
      check(`desktop ${path}: the current tab is ${label} (aria-current)`, cur.length === 1 && cur[0].trim() === label, cur.join(","));
    }
    await page.goto(`${BASE}/how-it-works`, { waitUntil: "load" });
    const right = await main.boundingBox();
    check("desktop: the tabs are right-aligned", !!right && right.x > 1440 / 2, `x=${right?.x}`);
    // Keyboard: Tab reaches each tab with a visible focus ring.
    await main.getByRole("link", { name: "Map" }).focus();
    const ring = await main.getByRole("link", { name: "Map" }).evaluate((el) => getComputedStyle(el).outlineStyle);
    check("desktop: a focused tab shows a focus ring", ring !== "none", ring);
    const foot = page.locator("footer");
    check("footer has Privacy and Sources", await foot.getByRole("link", { name: "Privacy" }).isVisible() && await foot.getByRole("link", { name: "Sources" }).isVisible());
    await page.context().close();
  }
  // Widening the window past the breakpoint closes the phone menu.
  {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(`${BASE}/support`, { waitUntil: "load" });
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog").waitFor();
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.waitForTimeout(500);
    check("the phone menu closes when the window is widened past the breakpoint", !(await page.getByRole("dialog").isVisible()));
    await page.context().close();
  }

  // Phone: wordmark, theme toggle and a menu button only.
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  const header = page.locator("header").first();
  check("phone: no row of links in the nav", !(await header.getByRole("link", { name: "How it works" }).isVisible()) && !(await header.getByRole("link", { name: "Get support" }).isVisible()));
  const button = page.getByRole("button", { name: "Open menu" });
  check("phone: the menu button has an accessible label", await button.isVisible());
  await button.click();
  const menu = page.getByRole("dialog");
  await menu.waitFor();
  const labels = (await menu.getByRole("link").allInnerTexts()).map((t) => t.trim());
  check("the menu lists the same destinations, then Privacy and Sources", JSON.stringify(labels) === JSON.stringify(["Map", "Rate your school", "How it works", "Get support", "Sign in", "Privacy", "Sources"]), labels.join(", "));
  const small = await menu.getByRole("link", { name: "Privacy" }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const big = await menu.getByRole("link", { name: "Map" }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check("Privacy and Sources are in smaller text", small < big, `${small} < ${big}`);
  const purple = await menu.getByRole("link", { name: "Get support" }).evaluate((el) => getComputedStyle(el).color);
  const supportToken = await page.evaluate(() => { const d = document.createElement("span"); d.style.color = "var(--onus-support)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  check("Get support is purple", purple === supportToken, purple);
  // Focus stays inside while open.
  let inside = true;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    inside &&= await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  }
  check("focus is trapped inside the menu", inside);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Escape closes it and focus returns to the button", !(await menu.isVisible()) && await button.evaluate((b) => b === document.activeElement));
  await button.click(); await menu.waitFor();
  await page.mouse.click(195, 800);
  await page.waitForTimeout(300);
  check("a tap outside closes it", !(await menu.isVisible()));
  await button.click(); await menu.waitFor();
  await menu.getByRole("link", { name: "Map" }).click();
  await page.waitForURL((u) => u.pathname === "/map", { timeout: 15000 });
  check("choosing a link closes it and goes there", !(await page.getByRole("dialog").isVisible()));
  await page.mouse.wheel(0, 600);
  check("phone: the nav stays at the top", Math.abs((await page.locator("header").first().boundingBox())!.y) < 1);
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
