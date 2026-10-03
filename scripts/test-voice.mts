// Milestone 10 checks: Ask in voice in a real browser, with a recorded audio file as the microphone.
// The recording ("If I report here, who finds out?") is made with macOS `say` into a temp folder. Speech to
// text and text to speech are the real ElevenLabs calls (one each, plus one for the routes check); /api/ask is
// intercepted with the cached UBC answer so no Gemini quota is used (it is checked live in test:ask-sheet).
// Needs the dev server and macOS. Usage: npm run test:voice
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};

const dir = mkdtempSync(join(tmpdir(), "onus-voice-"));
const QUESTION = "If I report here, who finds out?";
execFileSync("say", ["-v", "Samantha", "-o", join(dir, "q.aiff"), QUESTION]);
execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "1", join(dir, "q.aiff"), join(dir, "q.wav")]);
// Two seconds of silence for the "nothing was said" check.
execFileSync("say", ["-o", join(dir, "silent.aiff"), "[[slnc 2000]]"]);
execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "1", join(dir, "silent.aiff"), join(dir, "silent.wav")]);

const cache = JSON.parse(readFileSync(new URL("../data/ask-cache.json", import.meta.url), "utf8")).answers as { slug: string; answer: string; citations: unknown[] }[];
const ubc = cache.find((a) => a.slug === "ubc-vancouver")!;
const contact = { name: "University of British Columbia, Vancouver", office: null, phone: null, email: null };

async function openAsk(page: Page) {
  await page.goto(`${BASE}/map/ubc-vancouver`, { waitUntil: "load" });
  await page.getByRole("complementary").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByRole("button", { name: "Ask by voice" }).waitFor();
}
// Headless Chromium on macOS can't open even a fake microphone without the OS permission, so the page gets a
// microphone that plays the recorded file instead: getUserMedia returns a live stream of the WAV, which
// then goes through the app's real MediaRecorder, upload, speech to text, /api/ask and text to speech.
// Every stream handed out is kept, to check the microphone is released afterwards.
const launch = () => chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
async function micFromFile(page: Page, wav: string) {
  await page.route("**/__test-mic.wav", (r) => r.fulfill({ contentType: "audio/wav", body: readFileSync(wav) }));
  await page.addInitScript(() => {
    const w = window as unknown as { __streams: MediaStream[] };
    w.__streams = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await (await fetch("/__test-mic.wav")).arrayBuffer());
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.start();
      w.__streams.push(dest.stream);
      return dest.stream;
    };
  });
}

try {
  // 1. The routes on their own: the recorded file in, its words out; an answer in, MP3 out.
  {
    const form = new FormData();
    form.append("audio", new Blob([readFileSync(join(dir, "q.wav"))], { type: "audio/wav" }), "q.wav");
    const r = await fetch(`${BASE}/api/voice/transcribe`, { method: "POST", body: form });
    const j = (await r.json()) as { transcript?: string };
    check("transcribe route: the recorded question comes back as text", r.ok && /report here.*who finds out/i.test(j.transcript ?? ""), j.transcript);
    const bad = new FormData(); bad.append("audio", new Blob(["hello"], { type: "text/plain" }), "x.txt");
    check("transcribe route: refuses a file that isn't audio", (await fetch(`${BASE}/api/voice/transcribe`, { method: "POST", body: bad })).status === 415);
    const big = new FormData(); big.append("audio", new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "audio/webm" }), "big.webm");
    check("transcribe route: refuses a recording over 5 MB", (await fetch(`${BASE}/api/voice/transcribe`, { method: "POST", body: big })).status === 413);
    check("speak route: refuses text over 1,200 characters", (await fetch(`${BASE}/api/voice/speak`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "a".repeat(1201) }) })).status === 400);
  }

  // 2. The sheet: tap the mic, speak (the file), tap to stop; the question appears, the answer is read aloud.
  {
    const browser = await launch();
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await micFromFile(page, join(dir, "q.wav"));
    let asked = "";
    await page.route("**/api/ask", async (route) => {
      asked = (route.request().postDataJSON() as { question: string }).question;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ answer: ubc.answer, citations: ubc.citations, refused: false, crisis: false, fallback_contact: contact }) });
    });
    const speak = page.waitForResponse((r) => r.url().endsWith("/api/voice/speak"), { timeout: 30000 }).catch(() => null);
    await openAsk(page);
    await page.getByRole("button", { name: "Ask by voice" }).click();
    const t0 = Date.now();
    check("one tap starts listening: 'Listening…' with a timer", await page.getByText("Listening…").waitFor({ timeout: 5000 }).then(() => true).catch(() => false) && await page.getByText(/^0:0\d$/).isVisible());
    check("while listening, send is off and the mic becomes 'Stop and ask'", await page.getByRole("button", { name: "Send" }).isDisabled() && await page.getByRole("button", { name: "Stop and ask" }).isVisible());
    // No second tap: the question is about 2.2 s long, then silence.
    const thinking = await page.getByText("Thinking…").waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    const stoppedAfter = (Date.now() - t0) / 1000;
    check("it stops by itself after about 1.5 s of silence, then shows 'Thinking…'", thinking && stoppedAfter > 3.2 && stoppedAfter < 6, `stopped ${stoppedAfter.toFixed(1)} s after the tap (speech ends at 2.2 s)`);
    const shown = await page.locator("li p").filter({ hasText: /who finds out/i }).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    check("the transcript shows as your question", shown);
    check("the transcript goes to the same /api/ask", /report here.*who finds out/i.test(asked), asked);
    check("the answer text and its citation chip show on screen", await page.getByText(ubc.answer).isVisible() && await page.getByRole("button", { name: /Section 10, Policy/ }).isVisible());
    const res = await speak;
    const bytes = res ? (await res.body()).length : 0;
    check("the answer is sent to text to speech and comes back as audio", !!res && res.ok() && res.headers()["content-type"] === "audio/mpeg" && bytes > 20000, `${Math.round(bytes / 1024)} KB`);
    const speaking = await page.getByText("Speaking…").waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    check("Sarah's answer plays by itself: 'Speaking…', and the answer's button reads Stop", speaking && await page.getByRole("button", { name: "Stop reading aloud" }).filter({ hasText: /^Stop$/ }).isVisible());
    await page.screenshot({ path: "screenshots/voice-speaking-1440-light.png" });
    await page.getByRole("button", { name: "Stop speaking" }).click();
    check("the mic button stops the voice, and the box comes back", await page.getByRole("button", { name: "Listen to this answer" }).isVisible() && await page.getByLabel(/Your question about/).isVisible());
    await page.getByRole("button", { name: "Listen to this answer" }).click();
    check("Listen plays it again", await page.getByRole("button", { name: "Stop reading aloud" }).filter({ hasText: /^Stop$/ }).waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
    await page.getByRole("button", { name: "Stop reading aloud" }).click();
    const mic = await page.evaluate(() => {
      const st = (window as unknown as { __streams: MediaStream[] }).__streams;
      return { opened: st.length, live: st.flatMap((x) => x.getTracks()).filter((t) => t.readyState === "live").length };
    });
    check("the microphone is released after recording", mic.opened === 1 && mic.live === 0, JSON.stringify(mic));
    await browser.close();
  }

  // 2b. Tap to stop still works (the mic again, before the pause).
  {
    const browser = await launch();
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await micFromFile(page, join(dir, "q.wav"));
    let sent = 0;
    await page.route("**/api/voice/transcribe", (r) => { sent++; return r.fulfill({ contentType: "application/json", body: JSON.stringify({ transcript: "If I report here" }) }); });
    await page.route("**/api/ask", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ answer: ubc.answer, citations: ubc.citations, refused: false, crisis: false, fallback_contact: contact }) }));
    await page.route("**/api/voice/speak", (r) => r.abort());
    await openAsk(page);
    await page.getByRole("button", { name: "Ask by voice" }).click();
    await page.getByText("Listening…").waitFor();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Stop and ask" }).click();
    check("tapping the mic while listening still sends right away", await page.getByText(ubc.answer).waitFor({ timeout: 10000 }).then(() => true).catch(() => false) && sent === 1);
    check("if the voice can't play, the status clears and Listen is there", await page.getByRole("button", { name: "Listen to this answer" }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false) && !(await page.getByText("Speaking…").isVisible()) && !(await page.getByText("Thinking…").isVisible()));
    await browser.close();
  }

  // 3. Cancel with Escape: nothing is sent.
  {
    const browser = await launch();
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: "dark" })).newPage();
    await micFromFile(page, join(dir, "q.wav"));
    let sent = 0;
    await page.route("**/api/voice/transcribe", (r) => { sent++; return r.continue(); });
    await openAsk(page);
    await page.getByRole("button", { name: "Ask by voice" }).click();
    await page.getByText("Listening…").waitFor();
    await page.screenshot({ path: "screenshots/voice-listening-390-dark.png" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    check("Escape while listening cancels: nothing is sent, the box comes back", sent === 0 && await page.getByLabel(/Your question about/).isVisible());
    check("Escape while listening keeps you in the Ask sheet", await page.getByRole("heading", { name: "Ask about this policy" }).isVisible());
    await browser.close();
  }

  // 4. Microphone blocked: a plain message, typing still works.
  {
    const browser = await launch();
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
    });
    await openAsk(page);
    await page.getByRole("button", { name: "Ask by voice" }).click();
    check("microphone blocked: says how to fix it and that typing works", await page.getByText("Microphone access is off. Allow it in your browser, or type your question instead.").waitFor({ timeout: 5000 }).then(() => true).catch(() => false));
    await browser.close();
  }

  // 5. Silence: nothing to ask.
  {
    const browser = await launch();
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await micFromFile(page, join(dir, "silent.wav"));
    let uploaded = 0;
    await page.route("**/api/voice/transcribe", (r) => { uploaded++; return r.abort(); });
    await openAsk(page);
    await page.getByRole("button", { name: "Ask by voice" }).click();
    const msg = await page.getByText("We didn't catch a question. Try again, or type it instead.").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    check("silence: stops by itself after a while, says so, and uploads nothing", msg && uploaded === 0);
    await browser.close();
  }
  // 6. Audio blocked by the browser: no 'Speaking…', the Listen button is the way to play it.
  {
    const browser = await launch();
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    // A browser that keeps audio suspended (autoplay blocked). Passed as a string: tsx would add a helper
    // to the functions here that doesn't exist in the page.
    await page.addInitScript({ content: `
      Object.defineProperty(BaseAudioContext.prototype, "state", { get: function () { return "suspended"; }, configurable: true });
      AudioContext.prototype.resume = function () { return Promise.resolve(); };
    ` });
    let spoken = 0;
    await page.route("**/api/voice/speak", (r) => { spoken++; return r.abort(); });
    await page.route("**/api/ask", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ answer: ubc.answer, citations: ubc.citations, refused: false, crisis: false, fallback_contact: contact }) }));
    await page.route("**/api/voice/transcribe", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ transcript: QUESTION }) }));
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => new AudioContext().createMediaStreamDestination().stream;
    });
    await openAsk(page);
    await page.getByRole("button", { name: "Ask by voice" }).click();
    await page.getByRole("button", { name: "Stop and ask" }).click();
    await page.getByText(ubc.answer).waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const state = { spoken, speaking: await page.getByText("Speaking…").isVisible(), thinking: await page.getByText("Thinking…").isVisible(), listen: await page.getByRole("button", { name: "Listen to this answer" }).isVisible() };
    check("autoplay blocked: nothing is fetched or shown as speaking, Listen is ready", state.spoken === 0 && !state.speaking && !state.thinking && state.listen, JSON.stringify(state));
    await browser.close();
  }
} catch (e) {
  check("test run completed without crashing", false, (e as Error).message.split("\n")[0]);
} finally {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
