import Link from "next/link";
import { NavMenu } from "@/components/nav-menu";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { createClient } from "@/lib/supabase/server";

// The nav: pinned to the top of every page (sticky at the top of the page, so it never hides, slides or moves,
// and pages keep their layout), on glass so content passes softly beneath it. Phones: the wordmark, the theme
// toggle and a menu button; from sm, the links in a row.
export async function SiteNav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const link = "whitespace-nowrap rounded-full px-3 py-2 transition-colors";
  return (
    <header className="sticky top-0 z-40 w-full border-b border-hairline/70 bg-glass backdrop-blur-xl backdrop-saturate-[1.8]">
      <nav aria-label="Main" className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-text">Onus</Link>
        <div className="flex items-center gap-1 text-sm sm:gap-2">
          <div className="hidden items-center sm:flex">
            <Link href="/how-it-works" prefetch={false} className={`${link} text-text-secondary hover:text-text`}>How it works</Link>
            <Link href="/support" prefetch={false} className={`${link} text-support hover:bg-support/10`}>Get support</Link>
            {user ? (
              <Link href="/account" prefetch={false} className={`${link} text-text-secondary hover:text-text`}>My account</Link>
            ) : (
              <Link href="/signin" className={`${link} text-text-secondary hover:text-text`}>Sign in</Link>
            )}
          </div>
          <AnimatedThemeToggler />
          <NavMenu signedIn={!!user} />
        </div>
      </nav>
    </header>
  );
}
