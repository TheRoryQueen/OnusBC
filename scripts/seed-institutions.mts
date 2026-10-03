// Loads data/institutions.json into public.institutions (upsert by slug) and refreshes scores.
// Usage: npm run seed:institutions
import { readFileSync } from "node:fs";
import { dbClient } from "./lib/db.mts";

const { institutions } = JSON.parse(readFileSync(new URL("../data/institutions.json", import.meta.url), "utf8"));
const c = await dbClient();
await c.query("begin");
for (const i of institutions) {
  await c.query(
    `insert into public.institutions (slug, name, short_name, type, kind, sector, city, lat, lng, email_domains, employee_domains,
       alumni_domains, blocked_domains, website, policy_url, support_url, contact_office, contact_email, contact_phone, sources, flags)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     on conflict (slug) do update set name = excluded.name, short_name = excluded.short_name, type = excluded.type,
       kind = excluded.kind, sector = excluded.sector, city = excluded.city, lat = excluded.lat, lng = excluded.lng,
       email_domains = excluded.email_domains, employee_domains = excluded.employee_domains,
       alumni_domains = excluded.alumni_domains, blocked_domains = excluded.blocked_domains, website = excluded.website,
       policy_url = excluded.policy_url, support_url = excluded.support_url, contact_office = excluded.contact_office,
       contact_email = excluded.contact_email, contact_phone = excluded.contact_phone, sources = excluded.sources,
       flags = excluded.flags`,
    [i.slug, i.name, i.short_name, i.type, i.kind, i.sector, i.city, i.lat, i.lng, i.email_domains, i.employee_domains,
     i.alumni_domains, i.blocked_domains, i.website, i.policy_url, i.support_url, i.contact_office, i.contact_email,
     i.contact_phone, JSON.stringify(i.sources), i.flags ?? []]
  );
}
for (const { id } of (await c.query("select id from public.institutions")).rows) {
  await c.query("select public.refresh_scores($1)", [id]);
}
await c.query("commit");
const { rows } = await c.query(
  "select count(*)::int n, count(*) filter (where lat is not null)::int coords, count(*) filter (where cardinality(email_domains) > 0)::int domains from public.institutions"
);
console.log(`institutions: ${rows[0].n}, with coordinates: ${rows[0].coords}, with domains: ${rows[0].domains}`);
const extra = await c.query("select slug from public.institutions where slug <> all($1)", [institutions.map((i: { slug: string }) => i.slug)]);
if (extra.rows.length) console.log("rows not in the JSON:", extra.rows.map((r) => r.slug));
await c.end();
