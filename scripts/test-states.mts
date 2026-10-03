// Milestone 12 checks: loading, empty and error states (PRD, Gaps), and the rate limits. No model or voice
// calls: every rate-limit probe sends an invalid request, which the limiter counts before rejecting it.
// Needs the dev server. Usage: npm run test:states
import { chromium } from "@playwright/test";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
const ip = () => `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
async function burst(n: number, req: (ip: string) => Promise<Response>) {
  const who = ip(); const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((await req(who)).status);
  return out;
}

const browser = await chromium.launch();
try {
  // Loading: the school dots are in the first HTML, before the map engine loads.
  const html = await (await fetch(`${BASE}/map`)).text();
  check("map: dots are drawn in the first HTML (skeleton while the map loads)", (html.match(/non-scaling-stroke/g) ?? []).length >= 20);

  // No public policy: grey state, the login note, and the Request this policy action.
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${BASE}/map/cotr`, { waitUntil: "load" });
  const panel = page.getByRole("complementary");
  await panel.waitFor();
  check("no-policy school: grey state with its note", (await panel.innerText()).includes("No public policy") && (await panel.innerText()).includes("Policy exists but requires a login to read"));
  const req = panel.getByRole("link", { name: "Request policy" });
  check("no-policy school: a Request this policy action to the school's support page", (await req.getAttribute("href")) === "https://cotr.bc.ca/student-services/student-support/sexualized-violence/get-support/");
  check("no-policy school: no Ask button", (await panel.getByRole("button", { name: "Ask", exact: true }).count()) === 0);

  // Map engine fails (basemap unreachable): a quiet message, not a blank screen.
  const p2 = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p2.route("**/basemaps.cartocdn.com/**", (r) => r.abort());
  await p2.route("**/tiles.basemaps.cartocdn.com/**", (r) => r.abort());
  await p2.goto(`${BASE}/map`, { waitUntil: "load" });
  check("map engine fails: 'The map didn't load.' with a way to retry", await p2.getByText("The map didn't load.").waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
  await p2.context().close();

  // Ask fails at the network: a plain message, not a raw error.
  await page.goto(`${BASE}/map/ubc-vancouver`, { waitUntil: "load" });
  await page.getByRole("complementary").waitFor();
  await page.route("**/api/ask", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByLabel(/Your question about/).fill("Who is told if I report?");
  await page.getByLabel(/Your question about/).press("Enter");
  check("Ask fails: a quiet try-again message", await page.getByText("That didn't go through. Try again in a moment.").waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
  await page.context().close();

  // Empty: a search with no match on Get support.
  const p3 = await (await browser.newContext()).newPage();
  await p3.goto(`${BASE}/support`, { waitUntil: "load" });
  await p3.getByLabel("Find your school").fill("zzzz");
  check("Get support: an empty search says what to try", await p3.getByText("No school matches that. Try a city or a shorter name.").isVisible());
  await p3.context().close();

  // Rate limits (each from its own test IP so nothing real is blocked).
  const json = (body: string) => ({ method: "POST", headers: { "content-type": "application/json" }, body });
  const ask = await burst(11, (who) => fetch(`${BASE}/api/ask`, { ...json("not json"), headers: { "content-type": "application/json", "x-forwarded-for": who } }));
  check("/api/ask: 10 a minute per IP, then a friendly 429", ask.slice(0, 10).every((s) => s === 400) && ask[10] === 429, ask.join(","));
  const friendly = await (async () => { const who = ip(); let r: Response | null = null; for (let i = 0; i < 11; i++) r = await fetch(`${BASE}/api/ask`, { ...json("{}"), headers: { "content-type": "application/json", "x-forwarded-for": who } }); return ((await r!.json()) as { error?: string }).error ?? ""; })();
  check("the 429 says to try again in a moment", /try again in a moment/i.test(friendly), friendly);
  const t = await burst(11, (who) => fetch(`${BASE}/api/voice/transcribe`, { method: "POST", headers: { "x-forwarded-for": who }, body: new FormData() }));
  check("/api/voice/transcribe: 10 a minute per IP, then 429", t.slice(0, 10).every((s) => s === 400) && t[10] === 429, t.join(","));
  const sp = await burst(11, (who) => fetch(`${BASE}/api/voice/speak`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": who }, body: "{}" }));
  check("/api/voice/speak: 10 a minute per IP, then 429", sp.slice(0, 10).every((s) => s === 400) && sp[10] === 429, sp.join(","));
  const ed = await burst(21, (who) => fetch(`${BASE}/api/ratings`, { method: "PATCH", headers: { "content-type": "application/json", "x-forwarded-for": who }, body: JSON.stringify({ code: "bad", withdraw: true }) }));
  check("edit codes: 20 tries per 10 minutes per IP, then 429", ed.slice(0, 20).every((s) => s === 400) && ed[20] === 429, ed.join(","));
  const last = await fetch(`${BASE}/api/judge-login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.77.251.1" }, body: JSON.stringify({ email: "a@b.test", code: "wrong" }) });
  check("/api/judge-login refuses a wrong code (its 10-per-10-minutes limit is checked in test:auth)", last.status === 401);
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
