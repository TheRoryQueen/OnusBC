import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST /api/ratings { slug, answers } -> { code }          (signed in; one per school; submit_rating)
// PATCH /api/ratings { code, answers } | { code, withdraw }  (the code alone; edit_rating)
// Ratings are written only through those two database functions: submit_rating as the signed-in user,
// edit_rating by the server only (it takes the code alone, so attempts must pass this route's limit). The functions validate every answer, so no free text can be stored.

const ANSWER_KEYS = ["knows_how", "trust", "went_through", "believed", "informed", "time_bucket", "consequence"];

function cleanAnswers(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!ANSWER_KEYS.includes(k)) return null;
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

const MESSAGES: Record<string, { status: number; error: string }> = {
  not_signed_in: { status: 401, error: "Sign in to rate your school." },
  already_rated: { status: 409, error: "You've already rated this school. Use your code to change or withdraw it." },
  wrong_institution: { status: 403, error: "You can rate the school your email belongs to." },
  profile_incomplete: { status: 403, error: "Finish signing in first: choose your role or campus." },
  unknown_institution: { status: 404, error: "We couldn't find that school." },
  code_not_found: { status: 404, error: "That code didn't match a rating. Check it and try again." },
  invalid_code: { status: 400, error: "Codes are 8 letters and numbers." },
};
function fail(message: string) {
  const key = Object.keys(MESSAGES).find((k) => message.includes(k));
  if (key) return NextResponse.json({ error: MESSAGES[key].error }, { status: MESSAGES[key].status });
  if (message.includes("invalid_answers")) return NextResponse.json({ error: "One of the answers wasn't valid. Try again." }, { status: 400 });
  return NextResponse.json({ error: "Your rating didn't save. Try again in a moment." }, { status: 500 });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { slug?: unknown; answers?: unknown } | null;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const answers = cleanAnswers(body?.answers);
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !answers) return NextResponse.json({ error: "Send a school and your answers." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: MESSAGES.not_signed_in.error }, { status: 401 });
  const { data: inst } = await supabase.from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!inst) return NextResponse.json({ error: MESSAGES.unknown_institution.error }, { status: 404 });

  const { data, error } = await supabase.rpc("submit_rating", { p_institution_id: inst.id, p_answers: answers });
  if (error) return fail(error.message);
  return NextResponse.json({ code: data as string });
}

// Edit-code attempts: 20 per IP per 10 minutes (codes are ~40 bits; this keeps guessing pointless).
const editAttempts = new Map<string, number[]>();
function editLimited(ip: string) {
  const now = Date.now();
  const recent = (editAttempts.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  editAttempts.set(ip, recent);
  return recent.length > 20;
}

export async function PATCH(request: Request) {
  const ip = clientIp(request);
  if (editLimited(ip)) return NextResponse.json({ error: "Too many tries. Try again in a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { code?: unknown; answers?: unknown; withdraw?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const withdraw = body?.withdraw === true;
  const answers = withdraw ? null : cleanAnswers(body?.answers);
  if (!/^[A-Z0-9]{8}$/.test(code)) return NextResponse.json({ error: MESSAGES.invalid_code.error }, { status: 400 });
  if (!withdraw && !answers) return NextResponse.json({ error: "Send your new answers." }, { status: 400 });

  // edit_rating is callable only by the server (so every code attempt passes the limit above).
  const { error } = await createAdminClient().rpc("edit_rating", { p_edit_code: code, p_answers: answers, p_withdraw: withdraw });
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true, withdrawn: withdraw });
}
