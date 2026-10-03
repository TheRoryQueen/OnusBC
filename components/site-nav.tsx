import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { createClient } from "@/lib/supabase/server";

// Signed in: "Sign out" until My account exists (milestone 11), then My account.
export async function SiteNav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <header className="w-full">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6"
      >
        <Link href="/" className="text-lg font-semibold tracking-tight text-text">
          Onus
        </Link>
        <div className="flex items-center gap-0 text-sm sm:gap-2">
          <Link
            href="/how-it-works"
            className="whitespace-nowrap rounded-full px-2 py-2 text-text-secondary transition-colors hover:text-text sm:px-3"
          >
            How it works
          </Link>
          <Link
            href="/support"
            className="whitespace-nowrap rounded-full px-2 py-2 text-support sm:px-3 transition-colors hover:bg-support/10"
          >
            Get support
          </Link>
          {user ? (
            <SignOutButton className="whitespace-nowrap rounded-full px-2 py-2 text-text-secondary transition-colors hover:text-text sm:px-3" />
          ) : (
            <Link
              href="/signin"
              className="whitespace-nowrap rounded-full px-2 py-2 text-text-secondary transition-colors hover:text-text sm:px-3"
            >
              Sign in
            </Link>
          )}
          <AnimatedThemeToggler />
        </div>
      </nav>
    </header>
  );
}
