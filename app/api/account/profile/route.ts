import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/account/profile { role?, slug? } -> { ok }
// Changes the signed-in person's role or school through update_profile, which allows only what their school
// email proves (see supabase/migrations/20261004000007_update_profile.sql).
const MESSAGES: Record<string, string> = {
  school_locked_after_rating: "Your school can't change after you've rated, so a rating always belongs to the school you rated as.",
  institution_does_not_match_email: "Your school email doesn't belong to that school.",
  role_set_by_email: "Your school email sets your role, so it can't be changed here.",
  invalid_role: "Choose student, staff or alumni.",
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { role?: unknown; slug?: unknown } | null;
  const role = typeof body?.role === "string" ? body.role : null;
  const slug = typeof body?.slug === "string" ? body.slug : null;
  if (!role && !slug) return NextResponse.json({ error: "Send a role or a school." }, { status: 400 });
  if (slug && !/^[a-z0-9-]{2,40}$/.test(slug)) return NextResponse.json({ error: "We couldn't find that school." }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let institutionId: string | null = null;
  if (slug) {
    const { data: inst } = await supabase.from("institutions").select("id").eq("slug", slug).maybeSingle();
    if (!inst) return NextResponse.json({ error: "We couldn't find that school." }, { status: 404 });
    institutionId = inst.id;
  }
  const { error } = await supabase.rpc("update_profile", { p_role: role, p_institution_id: institutionId });
  if (error) {
    const key = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return NextResponse.json({ error: key ? MESSAGES[key] : "That didn't save. Try again in a moment." }, { status: key ? 403 : 500 });
  }
  return NextResponse.json({ ok: true });
}
