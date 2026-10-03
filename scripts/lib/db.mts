// Shared helpers for local scripts. Reads .env.local; never prints any value from it.
import { config } from "dotenv";
import pg from "pg";

config({ path: new URL("../../.env.local", import.meta.url).pathname, quiet: true });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env.local`);
  return v;
}

export async function dbClient() {
  const c = new pg.Client({ connectionString: requireEnv("SUPABASE_DB_URL"), ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}
