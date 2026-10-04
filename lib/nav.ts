import type { Tab } from "@/components/ui/vercel-tabs";

// One list of destinations for every screen size: the desktop tabs and the phone menu show the same links.
// Privacy and Sources live in the footer, and at the bottom of the phone menu in smaller text.
export const NAV_BREAKPOINT = 768; // the tabs show from md; below it, the menu button
export const mainNav = (signedIn: boolean): Tab[] => [
  { href: "/map", label: "Map" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/support", label: "Get support", tone: "support" },
  signedIn ? { href: "/account", label: "Account" } : { href: "/signin", label: "Sign in" },
];
export const SMALL_NAV = [
  { href: "/privacy", label: "Privacy" },
  { href: "/sources", label: "Sources" },
];
