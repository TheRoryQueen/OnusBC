// Screenshot check required by CLAUDE.md: every page at 390x844 and 1440x900, light and dark.
// Usage: npm run screenshots -- / /map   (defaults to /). Output: screenshots/ (gitignored).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/"];
const sizes = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
];
const schemes = ["light", "dark"] as const;

async function main() {
  mkdirSync("screenshots", { recursive: true });
  const browser = await chromium.launch();
  for (const path of paths) {
    for (const size of sizes) {
      for (const scheme of schemes) {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          colorScheme: scheme,
        });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        await page.goto(base + path, { waitUntil: "load" }); // not networkidle: the map keeps a realtime socket open
        // Maps and animations settle after network idle; SCREENSHOT_WAIT gives them time (ms).
        await page.waitForTimeout(Number(process.env.SCREENSHOT_WAIT ?? 0));
        const slug = path === "/" ? "home" : path.replace(/^\//, "").replace(/[/?=&]/g, "_");
        const file = `screenshots/${slug}-${size.name}-${scheme}.png`;
        await page.screenshot({ path: file, fullPage: false });
        const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth
        );
        console.log(
          `${file}  dark=${isDark}  horizontalOverflow=${overflow}  errors=${errors.length ? errors.join(" | ") : "none"}`
        );
        await context.close();
      }
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
