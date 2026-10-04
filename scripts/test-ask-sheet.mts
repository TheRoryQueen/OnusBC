// Milestone 9 checks for the Ask sheet in a real browser. /api/ask is intercepted with fixed responses for
// every UI check, so no model is called. With --live, two real questions go through the real /api/ask
// (two calls to the Ask chain's main model; never gemini-3.5-flash): a policy question must come back with
// citations, and an off-topic question must get the refusal with the school's own contact.
// Needs the dev server. Usage: npm run test:ask-sheet [-- --live]
import { chromium, type Page, type Route } from "@playwright/test";
import { dbClient } from "./lib/db.mts";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const LIVE = process.argv.includes("--live");
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};

const db = await dbClient();
const { rows: [ubc] } = await db.query("select name, contact_office, contact_phone from public.institutions where slug = 'ubc-vancouver'");
await db.end();
const contact = { name: ubc.name, office: ubc.contact_office, phone: ubc.contact_phone, email: null };

const ANSWER = {
  answer: "Names aren't included in a report unless the office believes it's necessary or you agree.",
  citations: [
    { document: "Policy", section: "10", quote: "The name or names of the individual or individuals who made the Disclosure or Disclosures will not be included in the Report" },
    { document: "Policy", section: "10", quote: "the Director of the relevant Sexual Violence Prevention and Response Office will notify the individual" },
  ],
  refused: false, crisis: false, fallback_contact: contact,
};
const REFUSAL = {
  answer: `That's outside what I can answer from ${ubc.name}'s policy. For help, contact ${ubc.contact_office} at ${ubc.contact_phone}, or visit Get support.`,
  citations: [], refused: true, crisis: false, fallback_contact: contact,
};
const CRISIS = {
  answer: "If you're in danger right now, call 911. You can reach VictimLinkBC any time at 1-800-563-0808. You don't have to report to get support. More help is on the Get support page.",
  citations: [], refused: false, crisis: true, fallback_contact: contact,
};

const browser = await chromium.launch();
const sent: unknown[] = [];
async function mockAsk(page: Page, reply: (q: string) => { status: number; body: unknown; delay?: number }) {
  await page.route("**/api/ask", async (route: Route) => {
    const body = route.request().postDataJSON() as { question: string };
    sent.push(body);
    const r = reply(body.question);
    if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
    await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) });
  });
}
const panelReady = async (page: Page, name: string) => page.getByRole("complementary", { name }).waitFor({ timeout: 30000 });

try {
  // Desktop: the Ask button, the box, an answer with citation chips.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await mockAsk(page, (q) =>
    /pizza/i.test(q) ? { status: 200, body: REFUSAL } : /danger/i.test(q) ? { status: 200, body: CRISIS } : /busy/i.test(q) ? { status: 429, body: { error: "Too many questions at once. Try again in a moment." } } : { status: 200, body: ANSWER, delay: 900 });
  await page.goto(`${BASE}/map/ubc-vancouver`, { waitUntil: "load" });
  await panelReady(page, ubc.name);
  const actions = page.getByRole("complementary").locator("div.mt-4.flex.gap-2 > *");
  check("panel action row starts with Ask", ((await actions.first().innerText()).trim()) === "Ask");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  check("Ask opens the sheet with the school name", await page.getByRole("heading", { name: "Ask about this policy" }).isVisible() && await page.getByRole("complementary").getByText(ubc.name, { exact: true }).isVisible());
  const box = page.getByLabel(`Your question about ${ubc.name}'s policy`);
  check("placeholder reads 'Ask about [School]'s policy'", (await box.getAttribute("placeholder")) === `Ask about ${ubc.name}'s policy`);
  const send = page.getByRole("button", { name: "Send" });
  check("send is disabled until there is text", await send.isDisabled());
  check("mic button is there", await page.getByRole("button", { name: /Ask by voice/ }).isVisible());
  check("no-personal-details note and Privacy link under the box", await page.getByText("Please don't share personal details. Questions aren't stored.").isVisible());
  await box.fill("x ".repeat(400));
  const h = (await box.boundingBox())!.height;
  check("the box grows with the text, up to about 200 px", h > 150 && h <= 201, `${Math.round(h)} px`);
  await box.fill("");
  await box.pressSequentially("first line");
  await box.press("Shift+Enter");
  await box.pressSequentially("second line");
  check("Shift+Enter adds a line", (await box.inputValue()) === "first line\nsecond line");
  await box.fill("If I report here, who finds out?");
  check("send turns on once there is text", await send.isEnabled());
  await box.press("Enter");
  check("Enter sends; the question shows and the box clears", await page.getByText("If I report here, who finds out?").first().isVisible() && (await box.inputValue()) === "");
  check("a typing indicator shows while waiting", await page.getByRole("status", { name: "Finding the answer in the policy" }).isVisible());
  await page.getByText(ANSWER.answer).waitFor({ timeout: 10000 });
  check("the answer appears", true);
  const chips = page.getByRole("button", { name: "Section 10, Policy" });
  check("citations collapse into one chip per section ('Section 10, Policy')", (await chips.count()) === 1);
  await chips.click();
  const quote = page.getByRole("button", { name: /Open the (policy|procedures) at this quote/ }).first().locator("span[lang=en]");
  check("tapping the chip shows the quoted clause in mono, as a link into the document", await quote.isVisible() && /mono/.test((await quote.getAttribute("class")) ?? ""));
  check("only slug and question are sent", JSON.stringify(Object.keys(sent[0] as object).sort()) === '["question","slug"]');

  await box.fill("What's the best pizza near campus?");
  await send.click();
  await page.getByText(REFUSAL.answer).waitFor({ timeout: 10000 });
  check("refusal shows the school's contact with a Call button and Get support", await page.getByRole("link", { name: `Call ${ubc.contact_phone}` }).isVisible() && await page.getByRole("link", { name: "Get support" }).last().isVisible());
  check("the Call button dials the school's number", (await page.getByRole("link", { name: `Call ${ubc.contact_phone}` }).getAttribute("href")) === `tel:${ubc.contact_phone.replace(/[^\d+]/g, "")}`);
  await box.fill("I'm in danger");
  await send.click();
  await page.getByText(CRISIS.answer).waitFor({ timeout: 10000 });
  check("crisis answer shows VictimLinkBC and Get support", await page.getByRole("link", { name: "VictimLinkBC" }).isVisible());
  await box.fill("busy test question");
  await send.click();
  check("a rate limit shows a plain try-again message", await page.getByText("Too many questions at once. Try again in a moment.").waitFor({ timeout: 10000 }).then(() => true).catch(() => false));

  await page.keyboard.press("Escape");
  check("Escape goes back to the school, not off the map", await page.getByRole("button", { name: "Ask", exact: true }).isVisible() && page.url().endsWith("/map/ubc-vancouver"));
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  check("the conversation is still there when you come back", await page.getByText(ANSWER.answer).isVisible());
  await page.getByRole("button", { name: `Back to ${ubc.name}` }).click();
  check("Back returns to the school details", await page.getByRole("heading", { name: ubc.name }).isVisible());
  await page.goto(`${BASE}/map/cotr`, { waitUntil: "load" });
  await panelReady(page, "College of the Rockies");
  check("no Ask button where no policy was found (COTR)", (await page.getByRole("button", { name: "Ask", exact: true }).count()) === 0);
  await ctx.close();

  // Phone: Ask opens the sheet full height, the box sits at the bottom, starter questions work.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: "dark" });
  const p2 = await phone.newPage();
  await mockAsk(p2, () => ({ status: 200, body: ANSWER }));
  await p2.goto(`${BASE}/map/ubc-vancouver`, { waitUntil: "load" });
  await panelReady(p2, ubc.name);
  await p2.getByRole("button", { name: "Ask", exact: true }).click();
  await p2.waitForTimeout(450);
  const sheet = (await p2.getByRole("complementary").boundingBox())!;
  check("phone: Ask opens the sheet at full height", sheet.height > 700, `${Math.round(sheet.height)} px`);
  const boxB = (await p2.getByLabel(`Your question about ${ubc.name}'s policy`).boundingBox())!;
  check("phone: the Ask box sits at the bottom of the sheet", boxB.y + boxB.height > 700 && boxB.y + boxB.height <= 844);
  await p2.getByRole("button", { name: "Can I get support without making a formal report?" }).click();
  check("phone: a starter question asks it", await p2.getByText(ANSWER.answer).waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
  check("phone: no horizontal scrolling", await p2.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await phone.close();

  // Live: two real calls through the real route (main Ask model; the question isn't stored).
  if (LIVE) {
    const live = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await live.goto(`${BASE}/map/ubc-vancouver`, { waitUntil: "load" });
    await panelReady(live, ubc.name);
    await live.getByRole("button", { name: "Ask", exact: true }).click();
    const liveBox = live.getByLabel(`Your question about ${ubc.name}'s policy`);
    const waitAnswer = () => live.waitForResponse((r) => r.url().endsWith("/api/ask"), { timeout: 60000 });
    await liveBox.fill("If I report here, who finds out?");
    const [r1] = await Promise.all([waitAnswer(), liveBox.press("Enter")]);
    const a1 = await r1.json();
    check("live: a policy question gets a cited answer", r1.ok() && !a1.refused && a1.citations.length > 0 && a1.citations.every((c: { quote: string }) => c.quote.length > 10), `${a1.citations.length} citations`);
    await live.waitForTimeout(500);
    check("live: the answer and a citation chip show in the sheet", await live.getByText(a1.answer.slice(0, 40), { exact: false }).isVisible() && (await live.getByRole("button", { name: /Policy|Procedures/ }).count()) > 0);
    await liveBox.fill("What's the best pizza place near campus?");
    const [r2] = await Promise.all([waitAnswer(), liveBox.press("Enter")]);
    const a2 = await r2.json();
    check("live: an off-topic question is refused", r2.ok() && a2.refused === true && a2.citations.length === 0);
    check("live: the refusal names the school's own contact office and phone", a2.answer.includes(ubc.contact_office) && a2.answer.includes(ubc.contact_phone), a2.answer);
    await live.screenshot({ path: "screenshots/ask-live-1440-light.png" });
    await live.context().close();
  }
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed${LIVE ? "" : " (UI only; add -- --live for the two real questions)"}`);
  process.exit(failed ? 1 : 0);
}
