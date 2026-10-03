// Applies supabase/migrations/*.sql in order, each once, each in its own transaction.
// Usage: npm run migrate
import { readdirSync, readFileSync } from "node:fs";
import { dbClient } from "./lib/db.mts";

const dir = new URL("../supabase/migrations/", import.meta.url).pathname;
const c = await dbClient();
await c.query(`create schema if not exists private;
  revoke all on schema private from public, anon, authenticated;
  create table if not exists private.applied_migrations (name text primary key, applied_at timestamptz not null default now());`);
const done = new Set((await c.query("select name from private.applied_migrations")).rows.map((r) => r.name));
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  if (done.has(f)) { console.log(`skip     ${f}`); continue; }
  try {
    await c.query("begin");
    await c.query(readFileSync(dir + f, "utf8"));
    await c.query("insert into private.applied_migrations (name) values ($1)", [f]);
    await c.query("commit");
    console.log(`applied  ${f}`);
  } catch (e) {
    await c.query("rollback");
    console.error(`FAILED   ${f}: ${(e as Error).message}`);
    await c.end();
    process.exit(1);
  }
}
await c.end();
