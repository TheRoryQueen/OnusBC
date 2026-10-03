"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Shown in the nav when signed in, until My account is built (milestone 11).
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await createClient().auth.signOut();
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
