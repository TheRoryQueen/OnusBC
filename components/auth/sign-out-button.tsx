"use client";

import { useRouter } from "next/navigation";

// Shown in the nav when signed in, until My account is built (milestone 11). The Supabase client is
// loaded only when someone actually signs out, so it stays out of every page's first bundle.
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const { createClient } = await import("@/lib/supabase/client");
        await createClient().auth.signOut();
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
