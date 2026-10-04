import Link from "next/link";
import { cn } from "@/lib/utils";

// The Onus logo, linking home. Ink on light, cream on dark; both images are in the page so the swap follows
// the theme class with no flash.
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Onus, home" className={cn("hit inline-flex items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-light.png" alt="" width={756} height={284} className="block h-full w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-dark.png" alt="" width={756} height={284} className="hidden h-full w-auto dark:block" />
    </Link>
  );
}
