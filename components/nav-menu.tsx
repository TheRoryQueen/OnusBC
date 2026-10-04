"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import { trapTab } from "@/lib/trap-tab";
import { cn } from "@/lib/utils";
import { NAV_BREAKPOINT, SMALL_NAV } from "@/lib/nav";
import type { Tab } from "@/components/ui/vercel-tabs";

// The phone menu: a menu button that opens a slide-down sheet with the same destinations as the desktop tabs,
// then Privacy and Sources in smaller text. Base UI's Dialog closes on Escape and on a tap outside and returns
// focus to the button; trapTab keeps focus inside while it's open; choosing a link closes it too, and so does
// widening the window past the breakpoint (where the tabs take over).
export function NavMenu({ tabs }: { tabs: Tab[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  useEffect(() => {
    const q = window.matchMedia(`(min-width: ${NAV_BREAKPOINT}px)`);
    const close = () => { if (q.matches) setOpen(false); };
    q.addEventListener("change", close);
    return () => q.removeEventListener("change", close);
  }, []);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger aria-label="Open menu" className="hit grid size-10 place-items-center rounded-full text-text transition-colors hover:bg-hairline/60 focus-visible:outline-2 focus-visible:outline-brand md:hidden">
        <Menu className="size-5" strokeWidth={1.75} aria-hidden />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-page/60 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup onKeyDown={trapTab} className="fixed inset-x-0 top-0 z-50 rounded-b-[28px] bg-raised px-4 pb-6 pt-3 shadow-[0_24px_64px_-24px_rgb(0_0_0/0.35)] ring-1 ring-hairline transition-[opacity,transform] duration-200 ease-out data-[ending-style]:-translate-y-4 data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-4 data-[starting-style]:opacity-0 motion-reduce:transition-none">
          <div className="flex h-10 items-center justify-between">
            <Dialog.Title className="text-lg font-semibold tracking-tight text-text">Onus</Dialog.Title>
            <Dialog.Close aria-label="Close menu" className="hit grid size-10 place-items-center rounded-full text-text hover:bg-hairline/60 focus-visible:outline-2 focus-visible:outline-brand">
              <X className="size-5" strokeWidth={1.75} aria-hidden />
            </Dialog.Close>
          </div>
          <nav aria-label="Menu" className="mt-3">
            <ul className="divide-y divide-hairline">
              {tabs.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} prefetch={false} onClick={() => setOpen(false)} aria-current={current(l.href) ? "page" : undefined}
                    className={cn("flex min-h-12 items-center px-1 text-[17px]", l.tone === "support" ? "font-medium text-support" : "text-text", current(l.href) && "font-semibold")}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-4 flex gap-5 border-t border-hairline px-1 pt-2">
              {SMALL_NAV.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} prefetch={false} onClick={() => setOpen(false)} aria-current={current(l.href) ? "page" : undefined}
                    className={cn("inline-flex min-h-11 items-center text-[14px] text-text-secondary hover:text-text", current(l.href) && "font-medium text-text")}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
