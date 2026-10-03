// Ask in other languages: the answer comes back in the question's language, quotes stay the policy's exact
// English, and the same rules hold (cite or refuse, crisis first). Offline checks always run; --live adds one
// real question each in French, Punjabi and Mandarin (3 calls to the Ask model; the Farsi live answer is the
// cached demo answer, built with npm run build:ask-cache -- sfu --question "...").
// Usage: npm run test:multilingual [-- --live]
import cacheFile from "../data/ask-cache.json" with { type: "json" };
import { ask, crisisText, refusalText, type CachedAnswer, type Deps } from "../lib/ask/chain.ts";
import { cachedAnswer } from "../lib/ask/cache.ts";
import { realDeps, school } from "./lib/ask-deps.mts";

export const FARSI_DEMO = "اگر اینجا گزارش بدهم، چه کسانی از گزارش من مطلع می‌شوند؟"; // "If I report here, who is informed of my report?"
const LIVE: [lang: string, slug: string, question: string, script: RegExp][] = [
  ["fr", "uvic", "Si je fais un signalement ici, qui sera au courant ?", /[a-zà-ÿ]/i],
  ["pa", "kpu", "ਜੇ ਮੈਂ ਇੱਥੇ ਰਿਪੋਰਟ ਕਰਾਂ ਤਾਂ ਕਿਸਨੂੰ ਪਤਾ ਲੱਗੇਗਾ?", /[਀-੿]/],
  ["zh", "ubc-vancouver", "如果我在这里举报，谁会知道？", /[一-鿿]/],
];
const FOREIGN = /[؀-ۿ਀-੿一-鿿]/;

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   [${detail}]` : ""}`);
  if (ok) passed++; else failed++;
};
const offline = (cache: Deps["cache"]): Deps => ({
  fetch: (async () => new Response("", { status: 503 })) as unknown as typeof fetch, apiKey: () => "x",
  retrieve: async () => [], cache, log: () => {}, timeoutMs: 1_500,
});
const contact = { name: "Simon Fraser University", office: "Sexual Violence Support and Prevention Office", phone: "778-782-7233", email: null };

// Offline: crisis and refusal in the question's language, and the cached Farsi answer when every model is down.
{
  const r = await ask(offline(() => null), { slug: "sfu", school: contact.name, question: "我现在有危险", contact });
  check("Mandarin crisis message gets 911 and VictimLinkBC in Mandarin, before any model", r.crisis && r.answered_by === "crisis" && r.answer === crisisText("zh") && r.answer.includes("911"));
  const f = await ask(offline(() => null), { slug: "sfu", school: contact.name, question: "ਇਸ ਨੀਤੀ ਬਾਰੇ ਇੱਕ ਸਵਾਲ", contact });
  check("with no model and no cache, a Punjabi question is refused in Punjabi with the school's contact", f.refused && f.answer === refusalText(contact, "pa") && f.answer.includes("778-782-7233"));
  const cached = (cacheFile as { answers: CachedAnswer[] }).answers.find((a) => a.question === FARSI_DEMO);
  check("the Farsi demo answer is cached", !!cached && cached.language === "fa", cached ? cached.generated_by : "missing");
  if (cached) {
    check("the cached Farsi answer is in Farsi", /[؀-ۿ]/.test(cached.answer));
    check("its quotes are the policy's English, untranslated", cached.citations.length > 0 && cached.citations.every((c) => !FOREIGN.test(c.quote) && /[a-z]{3}/i.test(c.quote)));
    const r2 = await ask(offline(cachedAnswer), { slug: "sfu", school: contact.name, question: FARSI_DEMO, contact });
    check("when every model fails, the Farsi demo question gets the cached Farsi answer", r2.answered_by === "cache" && r2.language === "fa" && r2.citations.length > 0);
  }
}

if (process.argv.includes("--live")) {
  for (const [lang, slug, question, script] of LIVE) {
    const s = await school(slug);
    const r = await ask(realDeps(fetch, () => null, () => {}), { slug, school: s.name, question, contact: s.contact });
    console.log(`\n[${lang}] ${s.name} (${r.answered_by}, ${r.model}, ${r.language})\n${r.answer}\n${r.citations.map((c) => `  "${c.quote}" (${c.document}, ${c.section})`).join("\n")}\n`);
    check(`${lang}: answered with citations, not refused`, !r.refused && !r.crisis && r.citations.length > 0, r.answered_by);
    check(`${lang}: answer is in the question's language`, r.language === lang && script.test(r.answer) && (lang !== "fr" || /\b(le|la|les|vous|est|des)\b/i.test(r.answer)), r.language);
    check(`${lang}: quotes are the policy's exact English`, r.citations.every((c) => !FOREIGN.test(c.quote)));
    await new Promise((res) => setTimeout(res, 6_000));
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
