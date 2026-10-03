// Real dependencies for driving lib/ask/chain.ts from scripts (service role, never in a browser).
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./db.mts";
import { makeRetrieve } from "../../lib/ask/retrieve.ts";
import type { Contact, Deps } from "../../lib/ask/chain.ts";

export const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
export const apiKey = () => requireEnv("GEMINI_API_KEY");

export async function school(slug: string): Promise<{ id: string; name: string; contact: Contact }> {
  const { data, error } = await admin.from("institutions").select("id, name, contact_office, contact_phone, contact_email").eq("slug", slug).single();
  if (error || !data) throw new Error(`unknown school ${slug}`);
  return { id: data.id, name: data.name, contact: { name: data.name, office: data.contact_office, phone: data.contact_phone, email: data.contact_email } };
}

export function realDeps(fetchImpl: typeof fetch, cache: Deps["cache"], log: Deps["log"]): Deps {
  return {
    fetch: fetchImpl,
    apiKey,
    retrieve: makeRetrieve({
      fetch: fetchImpl,
      apiKey,
      rpc: (fn, args) => admin.rpc(fn, args),
      institutionId: async (slug) => (await school(slug)).id,
    }),
    cache,
    log,
  };
}

// TEST-ONLY retrieval for when the free embedding quota (1,000 requests/day) is used up: Postgres
// full-text search over the same policy_chunks. Everything else in the chain stays live. Scripts that
// use it say so loudly; the app never does.
export function textSearchRetrieve(): Deps["retrieve"] {
  return async (slug, question) => {
    const words = question.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    const { dbClient } = await import("./db.mts");
    const db = await dbClient();
    const { rows } = await db.query(
      `select p.id, p.section, p.content,
              ts_rank(to_tsvector('english', p.content), to_tsquery('english', $2)) as rank
       from public.policy_chunks p join public.institutions i on i.id = p.institution_id
       where i.slug = $1 order by rank desc limit 6`,
      [slug, words.length ? words.join(" | ") : "policy"]
    );
    await db.end();
    return rows.map((r) => ({ id: Number(r.id), section: r.section, content: r.content }));
  };
}
