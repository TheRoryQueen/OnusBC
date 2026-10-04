import Link from "next/link";
import { NavMenu } from "@/components/nav-menu";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { Tabs } from "@/components/ui/vercel-tabs";
import { mainNav } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

// The nav: pinned to the top of every page (sticky, so it never hides, slides or moves, and pages keep their
// layout), on glass so content passes softly beneath it. The Onus wordmark goes to the map. From md: the
// destinations as right-aligned tabs (a sliding highlight on hover and focus, an underline under the
// current page) and the theme toggle. Phones: the wordmark, the theme toggle and a menu button with the same
// destinations.
export async function SiteNav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tabs = mainNav(!!user);
  return (
    <header className="sticky top-0 z-40 w-full border-b border-hairline/70 bg-glass backdrop-blur-xl backdrop-saturate-[1.8]">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/map" aria-label="Onus, the map" className="hit text-lg font-semibold tracking-tight text-text">Onus</Link>
        <div className="flex items-center gap-1 md:gap-3">
          <Tabs tabs={tabs} label="Main" className="hidden md:block" />
          <AnimatedThemeToggler />
          <NavMenu tabs={tabs} />
        </div>
      </div>
    </header>
  );
}
