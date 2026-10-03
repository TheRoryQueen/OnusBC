import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { createAdminClient } from "@/lib/supabase/admin";

// Judge access: any email plus the event code. Returns a one-time token hash the browser
// exchanges with supabase.auth.verifyOtp({ type: "magiclink", token_hash }). No email is sent.
// Judge ratings are stored with is_demo = true (see submit_rating).
// Rate limits: 10 attempts per IP per 10 minutes, and 200 wrong codes per 10 minutes across everyone (so
// changing IPs or headers can't brute-force the event code either).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function codeMatches(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const WINDOW_MS = 10 * 60_000;
const LIMIT = 10;
const attempts = new Map<string, number[]>();
const WRONG_LIMIT = 200;
let wrong: number[] = [];
function tooManyWrong() {
  const now = Date.now();
  wrong = wrong.filter((t) => now - t < WINDOW_MS);
  return wrong.length >= WRONG_LIMIT;
}
function limited(ip: string) {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > LIMIT;
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (limited(ip)) {
    return NextResponse.json({ error: "Too many tries. Try again in a few minutes." }, { status: 429 });
  }
  if (tooManyWrong()) {
    return NextResponse.json({ error: "Judge access is paused for a few minutes. Try again shortly." }, { status: 429 });
  }
  const expected = process.env.JUDGE_EVENT_CODE;
  if (!expected) {
    return NextResponse.json({ error: "Judge access isn't open right now." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Send an email and event code." }, { status: 400 });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!EMAIL.test(email) || email.length > 254 || !code) {
    return NextResponse.json({ error: "Send an email and event code." }, { status: 400 });
  }
  if (!codeMatches(code, expected)) {
    wrong.push(Date.now());
    return NextResponse.json({ error: "That event code didn't match." }, { status: 401 });
  }

  const admin = createAdminClient();
  // Clear this email past the domain hook, then create the user (no-op if it already exists).
  await admin.from("pending_judges").upsert({ email, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  try {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && !/already|registered|exists/i.test(created.error.message)) {
      return NextResponse.json({ error: "Couldn't start judge access. Try again in a moment." }, { status: 500 });
    }

    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error || !link.data.user) {
      return NextResponse.json({ error: "Couldn't start judge access. Try again in a moment." }, { status: 500 });
    }

    // Never hand out a sign-in token for a real (non-judge) account.
    const { data: profile } = await admin.from("profiles").select("is_judge").eq("id", link.data.user.id).single();
    if (!profile?.is_judge) {
      return NextResponse.json({ error: "Use a different email for judge access." }, { status: 403 });
    }

    return NextResponse.json({ token_hash: link.data.properties.hashed_token });
  } finally {
    await admin.from("pending_judges").delete().eq("email", email);
  }
}
