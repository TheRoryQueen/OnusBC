import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Judge access: any email plus the event code. Returns a one-time token hash the browser
// exchanges with supabase.auth.verifyOtp({ type: "magiclink", token_hash }). No email is sent.
// Judge ratings are stored with is_demo = true (see submit_rating).
// Rate limiting (10 per IP per 10 minutes) is added in milestone 6.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function codeMatches(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.JUDGE_EVENT_CODE;
  if (!expected) {
    return NextResponse.json({ error: "Judge access isn't open right now." }, { status: 503 });
  }

  let body: { email?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send an email and event code." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!EMAIL.test(email) || email.length > 254 || !code) {
    return NextResponse.json({ error: "Send an email and event code." }, { status: 400 });
  }
  if (!codeMatches(code, expected)) {
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
