import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST /api/account/delete { confirm: "delete" } -> { ok }
// Deletes the signed-in person's account: the auth user (email), and with it, by cascade, their profile
// (username, school, role) and has_rated rows. Ratings stay: they have no link to the account.
// Only ever the caller's own account; the service role key stays on the server.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== "delete") return NextResponse.json({ error: "Confirm to delete your account." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "Your account couldn't be deleted just now. Try again in a moment." }, { status: 500 });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
