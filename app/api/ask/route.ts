import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ask, type Contact } from "@/lib/ask/chain";
import { makeRetrieve } from "@/lib/ask/retrieve";
import { cachedAnswer } from "@/lib/ask/cache";

// POST /api/ask { slug, question } -> { answer, citations[{section, quote}], refused, crisis, fallback_contact }
// The question is never stored or logged. Rate limit: 10 per minute per IP (in memory, per server instance).

const WINDOW_MS = 60_000;
const LIMIT = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many questions at once. Try again in a moment." }, { status: 429 });
  }

  let body: { slug?: unknown; question?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a school and a question." }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || question.length < 3 || question.length > 500) {
    return NextResponse.json({ error: "Send a school and a question (up to 500 characters)." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: inst } = await admin
    .from("institutions")
    .select("id, name, contact_office, contact_phone, contact_email")
    .eq("slug", slug)
    .single();
  if (!inst) return NextResponse.json({ error: "We couldn't find that school." }, { status: 404 });

  const contact: Contact = { name: inst.name, office: inst.contact_office, phone: inst.contact_phone, email: inst.contact_email };
  const apiKey = () => {
    const k = process.env.GEMINI_API_KEY;
    if (!k) throw new Error("GEMINI_API_KEY is not set");
    return k;
  };

  const result = await ask(
    {
      fetch,
      apiKey,
      retrieve: makeRetrieve({
        fetch,
        apiKey,
        rpc: (fn, args) => admin.rpc(fn, args),
        institutionId: async () => inst.id,
      }),
      cache: cachedAnswer,
      log: (entry) => console.log(JSON.stringify(entry)),
    },
    { slug, school: inst.name, question, contact }
  );

  // Which model answered goes to the server log only.
  return NextResponse.json({
    answer: result.answer,
    citations: result.citations,
    refused: result.refused,
    crisis: result.crisis,
    fallback_contact: result.fallback_contact,
  });
}
