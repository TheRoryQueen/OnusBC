// Step 1: download each school's sexual violence policy, plus its separate procedures document where one
// exists (graded together as one text), into data/policies/. The manifest records every document's URL
// and SHA-256 hash; a changed combined hash marks the school for re-grading.
// Sites that block scripts: save the file by hand as data/policies/<slug>.pdf or <slug>.procedures.pdf
// and it is used (marked manual). A school whose policy needs a login keeps policy_found = false.
// Usage: npm run crawl
import { existsSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { MANIFEST, POLICIES, download, readManifest, sha256, writeJson, type DocEntry, type ManifestEntry } from "./common.mts";

type Inst = { slug: string; policy_url: string; procedures_url: string | null; policy_note: string | null };
const institutions: Inst[] = JSON.parse(readFileSync(new URL("../../data/institutions.json", import.meta.url), "utf8")).institutions;

const visibleText = (html: string) =>
  (html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html)
    .replace(/<(script|style|noscript|svg|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function fetchDoc(slug: string, role: "policy" | "procedures", url: string): DocEntry {
  const base = role === "policy" ? slug : `${slug}.procedures`;
  const tmp = `${POLICIES}${base}.download`;
  try {
    const r = download(url, tmp);
    const buf = existsSync(tmp) ? readFileSync(tmp) : Buffer.alloc(0);
    const isPdf = buf.subarray(0, 5).toString() === "%PDF-";
    const isHtml = !isPdf && /<html|<!doctype html/i.test(buf.subarray(0, 2000).toString());
    if (r.status === 200 && (isPdf || isHtml) && buf.length > 2000) {
      const kind = isPdf ? "pdf" : "html";
      for (const k of ["pdf", "html"]) if (k !== kind && existsSync(`${POLICIES}${base}.${k}`)) unlinkSync(`${POLICIES}${base}.${k}`);
      renameSync(tmp, `${POLICIES}${base}.${kind}`);
      // HTML pages carry per-request tokens and scripts; hash their visible text so an unchanged policy
      // isn't flagged as changed (and re-graded) on every crawl.
      const hash = kind === "pdf" ? sha256(buf) : sha256(visibleText(buf.toString("utf8")));
      return { role, url, final_url: r.finalUrl, status: r.status, kind, file: `${base}.${kind}`, bytes: buf.length, sha256: hash };
    }
    throw new Error(`status ${r.status}, ${buf.length} bytes, ${isPdf ? "pdf" : isHtml ? "html" : "unknown type"}`);
  } catch (e) {
    if (existsSync(tmp)) unlinkSync(tmp);
    const manual = `${POLICIES}${base}.pdf`;
    if (existsSync(manual)) {
      const buf = readFileSync(manual);
      return { role, url, status: 0, kind: "pdf", file: `${base}.pdf`, bytes: statSync(manual).size, sha256: sha256(buf), manual: true, error: (e as Error).message };
    }
    return { role, url, status: 0, error: (e as Error).message };
  }
}

const prev = readManifest();
const next: Record<string, ManifestEntry> = {};
let found = 0, withProcedures = 0;
for (const inst of institutions) {
  const at = new Date().toISOString();
  const docs: DocEntry[] = [fetchDoc(inst.slug, "policy", inst.policy_url)];
  if (inst.procedures_url) docs.push(fetchDoc(inst.slug, "procedures", inst.procedures_url));
  const policyDoc = docs[0];
  const policyFound = !!policyDoc.sha256 && !inst.policy_note;
  const combined = docs.filter((d) => d.sha256).map((d) => d.sha256).join("+");
  const entry: ManifestEntry = {
    url: inst.policy_url, fetched_at: at, policy_found: policyFound, documents: docs,
    sha256: combined || undefined, // policy hash, or policy+procedures hashes joined
    ...(inst.policy_note ? { note: inst.policy_note } : {}),
  };
  const old = prev[inst.slug]?.sha256;
  if (entry.sha256 && old && old !== entry.sha256) { entry.changed = true; entry.previous_sha256 = old; }
  if (policyFound) found++;
  if (policyFound && docs.length > 1 && docs[1].sha256) withProcedures++;
  next[inst.slug] = entry;
  const show = (d: DocEntry) => d.sha256 ? `${d.role} ${d.kind} ${d.bytes}B${d.manual ? " (manual copy)" : ""}` : `${d.role} MISSING (${d.error})`;
  console.log(`${policyFound ? "found  " : "MISSING"}  ${inst.slug.padEnd(15)} ${docs.map(show).join(" + ")}${inst.policy_note ? `  [${inst.policy_note}]` : ""}${entry.changed ? "  CHANGED" : ""}`);
}
writeJson(MANIFEST, next);
console.log(`\n${found} of ${institutions.length} policies found; ${withProcedures} with a separate procedures document`);
