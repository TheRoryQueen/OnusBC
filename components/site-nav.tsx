import Link from "next/link";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

// Sign in swaps to My account once auth is wired up (milestone 6).
export function SiteNav() {
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
          <Link
            href="/signin"
            className="whitespace-nowrap rounded-full px-2 py-2 text-text-secondary transition-colors hover:text-text sm:px-3"
          >
            Sign in
          </Link>
          <AnimatedThemeToggler />
        </div>
      </nav>
    </header>
  );
}
