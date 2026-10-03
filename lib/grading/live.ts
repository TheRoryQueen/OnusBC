import "server-only";
import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import samplesFile from "@/data/grade-samples/samples.json";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CriterionEvent, GradeEvent, RunResult, Sample } from "./events";
import { MIN_CHARS, extractDocument } from "./extract";
import { SCHEMA, SYSTEM, checkItem, completeObjects, letterFor, paperGpa, policyText, quoteIndex, rubricText, type Item } from "./grader";
import { RUBRIC } from "./rubric";

// The live grader ("Grade a policy"): one PDF, the same extraction, prompt and quote check as the BC
// policies, streamed as it happens. One run makes exactly one Gemini call. It uses the light model so the
// grading model's 20 requests a day stay free for the nightly BC run; the quote check is code, not a
// model, so every quote is still checked word for word. Results are never written to the BC map.

export const LIVE_MODEL = "gemini-3.5-flash-lite";
export const DAILY_RUN_CAP = 10; // live runs per day (Pacific time), across everyone
const RUN_TIMEOUT_MS = 100_000;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

export const SAMPLES = (samplesFile as { samples: Sample[] }).samples;

/** Judges (event code sign-in) and admins (ONUS_ADMIN_EMAILS, server-only) may run the grader. */
export async function graderAccess(): Promise<{ ok: true; who: "judge" | "admin" } | { ok: false; signedIn: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, signedIn: false };
  const admins = (process.env.ONUS_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (user.email && admins.includes(user.email.toLowerCase())) return { ok: true, who: "admin" };
  const { data } = await supabase.from("profiles").select("is_judge").eq("id", user.id).maybeSingle();
  return data?.is_judge ? { ok: true, who: "judge" } : { ok: false, signedIn: true };
}

// Start of today in Pacific time, as an ISO timestamp.
function startOfDayPacific() {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", timeZoneName: "longOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value.replace("GMT", "") || "-08:00";
  return new Date(`${day}T00:00:00${offset}`).toISOString();
}

/** Whether a run may start: under the daily cap, and no other run in progress. */
export async function quotaCheck(): Promise<{ ok: true; usedToday: number } | { ok: false; message: string; usedToday: number }> {
  const db = createAdminClient();
  const { count } = await db.from("grading_runs").select("id", { count: "exact", head: true }).gte("created_at", startOfDayPacific()).gt("gemini_calls", 0);
  const used = count ?? 0;
  if (used >= DAILY_RUN_CAP) return { ok: false, usedToday: used, message: `Today's ${DAILY_RUN_CAP} live runs are used up, to protect the shared Gemini quota.` };
  const { count: running } = await db.from("grading_runs").select("id", { count: "exact", head: true }).eq("status", "running").gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString());
  if ((running ?? 0) > 0) return { ok: false, usedToday: used, message: "Another live run is in progress. Try again in a minute." };
  return { ok: true, usedToday: used };
}

export async function latestRecorded(): Promise<RunResult | null> {
  const { data } = await createAdminClient().from("grading_runs").select("result").eq("status", "done").order("finished_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.result as RunResult | null) ?? null;
}

// ---- Fetching a pasted URL safely: public https hosts only, re-checked at every redirect, size-capped.
function privateAddress(ip: string) {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}
export class UserFacingError extends Error {}
async function assertPublic(url: URL) {
  if (url.protocol !== "https:") throw new UserFacingError("Use an https:// link to a PDF.");
  if (url.username || url.password || (url.port && url.port !== "443")) throw new UserFacingError("That link isn't a plain public web address.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) throw new UserFacingError("That website couldn't be found.");
  if (addrs.some(privateAddress)) throw new UserFacingError("That link points to a private network address.");
}
export async function fetchPdf(raw: string): Promise<Uint8Array> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new UserFacingError("That isn't a valid link."); }
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "user-agent": "Mozilla/5.0 (compatible; Onus policy grader; +https://onusmap.tech)", accept: "application/pdf,*/*;q=0.5" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location")!, url); continue; }
    if (!res.ok || !res.body) throw new UserFacingError(`The website answered with HTTP ${res.status}.`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_PDF_BYTES) throw new UserFacingError("That PDF is over 15 MB.");
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PDF_BYTES) { await reader.cancel(); throw new UserFacingError("That PDF is over 15 MB."); }
      parts.push(value);
    }
    const data = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { data.set(p, at); at += p.length; }
    if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") throw new UserFacingError("That link isn't a PDF file.");
    return data;
  }
  throw new UserFacingError("That link redirects too many times.");
}

// ---- The run.
type Source = { kind: "sample"; sample: Sample } | { kind: "url"; url: string };

export async function runGrade(source: Source, emit: (e: GradeEvent) => void): Promise<RunResult> {
  const t0 = Date.now();
  const label = source.kind === "sample" ? `${source.sample.name}, ${source.sample.title}` : new URL(source.url).hostname;
  const url = source.kind === "sample" ? source.sample.url : source.url;
  const db = createAdminClient();
  const { data: row } = await db.from("grading_runs").insert({ source_kind: source.kind, source_label: label, source_url: url, model: LIVE_MODEL }).select("id").single();
  const finish = (patch: Record<string, unknown>) => row ? db.from("grading_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", row.id).then(() => {}) : Promise.resolve();
  let calls = 0;

  try {
    emit({ type: "stage", stage: "download", detail: url });
    const pdf = source.kind === "sample"
      ? new Uint8Array(await readFile(path.join(process.cwd(), "data/grade-samples", path.basename(source.sample.file))))
      : await fetchPdf(source.url);

    emit({ type: "stage", stage: "extract" });
    const { sections: raw, pages } = await extractDocument("pdf", pdf);
    const sections = raw.map((s) => ({ ...s, document: "Policy" as const }));
    const chars = sections.reduce((n, s) => n + s.text.length, 0);
    if (chars < MIN_CHARS) throw new UserFacingError(`Only ${chars} characters of text came out of that PDF; it may be a scan or a cover page.`);
    emit({ type: "document", pages, chars, sections: sections.length });

    emit({ type: "stage", stage: "grade", detail: LIVE_MODEL });
    const index = quoteIndex(sections);
    const criteria: CriterionEvent[] = [];
    const seen = new Set<string>();
    const onItem = (it: Item) => {
      const c = RUBRIC.find((r) => r.id === it.criterion_id);
      if (!c || seen.has(c.id)) return;
      seen.add(c.id);
      const checked = checkItem(c.id, it, index);
      const ev: CriterionEvent = { type: "criterion", category: c.category, label: c.label, ...checked };
      criteria.push(ev);
      emit(ev);
    };

    calls = 1;
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${LIVE_MODEL}:streamGenerateContent?alt=sse`, {
      method: "POST",
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `RUBRIC\n${rubricText()}\n\nPOLICY (${label})\n${policyText(sections)}` }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    });
    if (res.status === 429) throw new UserFacingError("The grading model is at its rate limit right now.");
    if (!res.ok || !res.body) throw new UserFacingError(`The grading model answered with HTTP ${res.status}.`);

    // Server-sent events: each "data:" line is a partial response. Criteria are checked as soon as each
    // one is complete, so the page shows them as the model writes them.
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "", json = "", read = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const chunk = JSON.parse(line.slice(5));
        for (const p of chunk.candidates?.[0]?.content?.parts ?? []) if (!p.thought && p.text) json += p.text;
        const { objects, next } = completeObjects(json, read);
        read = next;
        for (const o of objects) onItem(o as Item);
      }
    }

    emit({ type: "stage", stage: "verify" });
    // Any criterion the model skipped scores 0 ("Not graded."), as in the BC pipeline.
    for (const c of RUBRIC) if (!seen.has(c.id)) onItem({ criterion_id: c.id, score: 0, quote: "", section: "", reason: "" });
    if (criteria.every((c) => c.model_score === 0 && !c.model_quote)) throw new UserFacingError("The grading model didn't return any grades.");
    criteria.sort((a, b) => RUBRIC.findIndex((r) => r.id === a.criterion_id) - RUBRIC.findIndex((r) => r.id === b.criterion_id));
    const gpa = paperGpa(criteria);
    const quoted = criteria.filter((c) => c.model_score > 0);
    const result: RunResult = {
      source: { kind: source.kind, label, url },
      document: { pages, chars, sections: sections.length },
      criteria, paper_gpa: gpa, paper_letter: letterFor(gpa),
      quotes_checked: quoted.length, quotes_verified: quoted.filter((c) => c.verified).length, quotes_rejected: quoted.filter((c) => !c.verified).length,
      model: LIVE_MODEL, gemini_calls: calls, ms: Date.now() - t0, finished_at: new Date().toISOString(),
    };
    await finish({ status: "done", gemini_calls: calls, result });
    emit({ type: "done", result });
    return result;
  } catch (e) {
    await finish({ status: "failed", gemini_calls: calls, error: (e as Error).message.slice(0, 300) });
    throw e;
  }
}
