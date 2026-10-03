// Step 1: download each school's sexual violence policy into data/policies/ and record a manifest
// with the source URL and a SHA-256 hash of the document. A changed hash marks the school for
// re-grading. Pages that block scripts can be saved by hand as data/policies/<slug>.pdf (manual).
// Usage: npm run crawl
import { existsSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { MANIFEST, POLICIES, download, institutions, readManifest, sha256, writeJson, type ManifestEntry } from "./common.mts";

const prev = readManifest();
const next: Record<string, ManifestEntry> = {};
let found = 0;
for (const inst of institutions) {
  const tmp = `${POLICIES}${inst.slug}.download`;
  const at = new Date().toISOString();
  let entry: ManifestEntry;
  try {
    const r = download(inst.policy_url, tmp);
    const buf = existsSync(tmp) ? readFileSync(tmp) : Buffer.alloc(0);
    const isPdf = buf.subarray(0, 5).toString() === "%PDF-";
    const isHtml = !isPdf && /<html|<!doctype html/i.test(buf.subarray(0, 2000).toString());
    if (r.status === 200 && (isPdf || isHtml) && buf.length > 2000) {
      const kind = isPdf ? "pdf" : "html";
      const file = `${inst.slug}.${kind}`;
      for (const k of ["pdf", "html"]) if (k !== kind && existsSync(`${POLICIES}${inst.slug}.${k}`)) unlinkSync(`${POLICIES}${inst.slug}.${k}`);
      renameSync(tmp, POLICIES + file);
      entry = { url: inst.policy_url, final_url: r.finalUrl, status: r.status, kind, file, bytes: buf.length, sha256: sha256(buf), fetched_at: at, policy_found: true };
    } else {
      throw new Error(`status ${r.status}, ${buf.length} bytes, ${isPdf ? "pdf" : isHtml ? "html" : "unknown type"}`);
    }
  } catch (e) {
    if (existsSync(tmp)) unlinkSync(tmp);
    const manual = `${POLICIES}${inst.slug}.pdf`;
    if (existsSync(manual) && prev[inst.slug]?.manual) {
      const buf = readFileSync(manual);
      entry = { ...prev[inst.slug], fetched_at: at, sha256: sha256(buf), bytes: statSync(manual).size, policy_found: true, manual: true };
    } else {
      entry = { url: inst.policy_url, status: 0, fetched_at: at, policy_found: false, error: (e as Error).message };
    }
  }
  const old = prev[inst.slug]?.sha256;
  if (entry.sha256 && old && old !== entry.sha256) { entry.changed = true; entry.previous_sha256 = old; }
  if (entry.policy_found) found++;
  next[inst.slug] = entry;
  console.log(`${entry.policy_found ? "found " : "MISSING"}  ${inst.slug.padEnd(15)} ${entry.kind ?? ""} ${entry.bytes ?? ""}${entry.changed ? "  CHANGED since last crawl" : ""}${entry.error ? `  (${entry.error})` : ""}`);
}
writeJson(MANIFEST, next);
console.log(`\n${found} of ${institutions.length} policies found`);
