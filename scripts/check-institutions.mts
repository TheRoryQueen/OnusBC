// Milestone 3 check: data/institutions.json is complete, every field has a source, and the sources
// still say what the file says. Re-fetches live pages, so run it before shipping and after edits.
// Usage: npm run check:institutions
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

type Inst = {
  slug: string; name: string; type: string; city: string; lat: number; lng: number;
  email_domains: string[]; employee_domains: string[]; alumni_domains: string[]; blocked_domains: string[];
  website: string; policy_url: string; support_url: string;
  contact_office: string | null; contact_email: string | null; contact_phone: string | null;
  sources: Record<string, string>; flags?: string[];
};
const data = JSON.parse(readFileSync(new URL("../data/institutions.json", import.meta.url), "utf8"));
const list: Inst[] = data.institutions;
const UA = "Onus/0.1 (StormHacks 2026 student project; scarlet.maleki@gmail.com)";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

let failed = 0;
const warn: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) { failed++; console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`); }
  return ok;
};
// curl uses the system certificate store and follows redirects; returns [status, body].
function get(url: string, ua = BROWSER_UA): [number, string] {
  try {
    const out = execFileSync("curl", ["-sSL", "--max-time", "30", "-A", ua, "-w", "\n__STATUS__%{http_code}", url], { encoding: "utf8", maxBuffer: 50e6 });
    const i = out.lastIndexOf("\n__STATUS__");
    return [Number(out.slice(i + 11)), out.slice(0, i)];
  } catch { return [0, ""]; }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const digits = (s: string) => s.replace(/\D/g, "");
const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&");

// Pages that refuse scripted requests; verified by hand in a browser on 2026-10-01.
const BROWSER_VERIFIED = new Set(["https://www.bcit.ca/respect/contact-rdi/",
  "https://ecuad.ca/life-at-ecu/campus-services/safety-incident-reporting/sexual-violence-prevention-support/",
  "https://www.royalroads.ca/student-life/counselling-accessibility-wellness/sexual-violence-prevention-response"]);

console.log(`== Structure (${list.length} entries) ==`);
check("26 map entries (25 institutions, UBC twice)", list.length === 26, String(list.length));
check("slugs unique", new Set(list.map((i) => i.slug)).size === list.length);
for (const i of list) {
  const id = i.slug;
  check(`${id}: name, type, city`, !!i.name && ["university", "college"].includes(i.type) && !!i.city);
  check(`${id}: coordinates inside BC (lat 48.2 to 60, lng -139 to -114)`, i.lat > 48.2 && i.lat < 60 && i.lng > -139 && i.lng < -114, `${i.lat},${i.lng}`);
  check(`${id}: has a student or shared sign-in domain`, i.email_domains.length > 0);
  check(`${id}: domains are bare lowercase hostnames`, [...i.email_domains, ...i.employee_domains, ...i.alumni_domains, ...i.blocked_domains].every((d) => /^[a-z0-9.-]+\.[a-z]+$/.test(d)));
  check(`${id}: no accepted domain is also blocked`, !i.blocked_domains.some((d) => [...i.email_domains, ...i.employee_domains, ...i.alumni_domains].includes(d)));
  check(`${id}: website`, /^https:\/\//.test(i.website));
  check(`${id}: contact office`, !!i.contact_office);
  if (!i.contact_email && !i.contact_phone) warn.push(`${id}: no office email or phone published (flagged in file)`);
  for (const k of ["coordinates", "domains", "contact", "policy"]) check(`${id}: source link for ${k}`, /^https?:\/\//.test(i.sources?.[k] ?? ""));
  if (i.contact_email || i.contact_phone) check(`${id}: contact has a source`, !!i.sources.contact);
}

console.log("\n== Coordinates match the cited OpenStreetMap objects ==");
const ids = list.map((i) => {
  const m = i.sources.coordinates.match(/openstreetmap\.org\/(node|way|relation)\/(\d+)/);
  return m ? `${m[1][0].toUpperCase()}${m[2]}` : "";
});
check("every coordinate source is an OpenStreetMap object link", ids.every(Boolean));
const looked: Record<string, { lat: number; lon: number; name: string }> = {};
for (let k = 0; k < ids.length; k += 20) {
  const [status, body] = get(`https://nominatim.openstreetmap.org/lookup?format=jsonv2&osm_ids=${ids.slice(k, k + 20).join(",")}`, UA);
  if (status === 200) for (const r of JSON.parse(body)) looked[`${r.osm_type[0].toUpperCase()}${r.osm_id}`] = { lat: +r.lat, lon: +r.lon, name: r.name };
  await sleep(1200);
}
list.forEach((i, n) => {
  const o = looked[ids[n]];
  if (!check(`${i.slug}: OSM object found`, !!o, ids[n])) return;
  const dist = Math.hypot(o.lat - i.lat, (o.lon - i.lng) * Math.cos((i.lat * Math.PI) / 180)) * 111;
  check(`${i.slug}: coordinate within 0.5 km of OSM centre`, dist < 0.5, `${dist.toFixed(2)} km from ${o.name}`);
});
console.log(`  looked up ${Object.keys(looked).length} objects`);

console.log("\n== Contacts appear verbatim on the live source page ==");
const cache = new Map<string, [number, string]>();
for (const i of list) {
  const src = i.sources.contact;
  if (BROWSER_VERIFIED.has(src)) { console.log(`  ${i.slug}: verified in browser (site blocks scripts)`); continue; }
  if (!cache.has(src)) cache.set(src, get(src));
  const [status, html] = cache.get(src)!;
  if (!check(`${i.slug}: contact page loads`, status === 200, `${status} ${src}`)) continue;
  const text = textOf(html);
  if (i.contact_email) check(`${i.slug}: email ${i.contact_email} on page`, html.toLowerCase().includes(i.contact_email.toLowerCase()));
  if (i.contact_phone) {
    const main = i.contact_phone.split(/ext/i)[0];
    check(`${i.slug}: phone ${i.contact_phone} on page`, digits(text).includes(digits(main)) || digits(html).includes(digits(main)));
  }
}

console.log("\n== Websites resolve ==");
for (const i of list) {
  const [status] = get(i.website);
  if (status === 403) warn.push(`${i.slug}: ${i.website} answers 403 to scripts (bot protection); open in a browser`);
  else check(`${i.slug}: ${i.website} loads`, status >= 200 && status < 400, String(status));
}

console.log("\n== Flags carried in the file ==");
for (const i of list) for (const f of i.flags ?? []) console.log(`  ${i.slug}: ${f}`);
for (const w of warn) console.log(`WARN  ${w}`);
console.log(`\n${failed ? `${failed} FAILED` : "ALL CHECKS PASSED"}`);
process.exit(failed ? 1 : 0);
