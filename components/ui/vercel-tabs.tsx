"use client"

// Adapted from the vercel-tabs component (a sliding hover highlight and an underline under the active tab).
// Changes for Onus: each tab is a real Next.js Link; the active tab comes from the current route, not internal
// state; keyboard focus moves the highlight the same way the pointer does, with a visible focus ring and
// aria-current on the current page; colours are the Onus theme tokens (no hex), so both themes work. The
// highlight and underline are placed straight on their elements after measuring, so they never jump on load.

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export interface Tab {
  href: string
  label: string
  /** Paths that also make this tab current (for example "/rate" for /rate/sfu). */
  match?: string[]
  /** "support" draws the tab in the purple support colour. */
  tone?: "support"
}

interface TabsProps extends React.HTMLAttributes<HTMLElement> {
  tabs: Tab[]
  label: string
}

const isActive = (tab: Tab, path: string) =>
  [tab.href, ...(tab.match ?? [])].some((p) => path === p || path.startsWith(`${p}/`))

const Tabs = React.forwardRef<HTMLElement, TabsProps>(({ className, tabs, label, ...props }, ref) => {
  const pathname = usePathname() ?? "/"
  const activeIndex = tabs.findIndex((t) => isActive(t, pathname))
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null)
  const tabRefs = React.useRef<(HTMLAnchorElement | null)[]>([])
  const highlight = React.useRef<HTMLDivElement>(null)
  const underline = React.useRef<HTMLDivElement>(null)
  const placed = React.useRef(false)

  // Place the underline under the current tab: at once the first time, then sliding. Re-placed when the
  // fonts or the window change the tabs' widths.
  React.useLayoutEffect(() => {
    const line = underline.current
    if (!line) return
    const place = () => {
      const el = tabRefs.current[activeIndex]
      if (!el) { line.style.opacity = "0"; return }
      if (!placed.current) line.style.transition = "none"
      Object.assign(line.style, { left: `${el.offsetLeft}px`, width: `${el.offsetWidth}px`, opacity: "1" })
      if (!placed.current) { void line.offsetWidth; line.style.transition = ""; placed.current = true }
    }
    place()
    const ro = new ResizeObserver(place)
    tabRefs.current.forEach((el) => el && ro.observe(el))
    return () => ro.disconnect()
  }, [activeIndex])

  // The hover (and keyboard focus) highlight.
  React.useLayoutEffect(() => {
    const box = highlight.current
    if (!box) return
    const el = hoveredIndex === null ? null : tabRefs.current[hoveredIndex]
    if (el) Object.assign(box.style, { left: `${el.offsetLeft}px`, width: `${el.offsetWidth}px`, opacity: "1" })
    else box.style.opacity = "0"
  }, [hoveredIndex])

  return (
    <nav ref={ref} aria-label={label} className={cn("relative", className)} {...props}>
      <div className="relative">
        {/* Hover highlight */}
        <div
          ref={highlight}
          aria-hidden
          className="absolute top-1/2 h-9 -translate-y-1/2 rounded-full bg-hairline/70 opacity-0 transition-all duration-300 ease-out motion-reduce:transition-none"
        />
        {/* Current page underline */}
        <div
          ref={underline}
          aria-hidden
          className={cn(
            "absolute -bottom-[13px] h-[2px] rounded-full opacity-0 transition-all duration-300 ease-out motion-reduce:transition-none",
            tabs[activeIndex]?.tone === "support" ? "bg-support" : "bg-text"
          )}
        />
        <ul className="relative flex items-center gap-1.5" onMouseLeave={() => setHoveredIndex(null)}>
          {tabs.map((tab, index) => {
            const active = index === activeIndex
            return (
              <li key={tab.href}>
                <Link
                  ref={(el) => { tabRefs.current[index] = el }}
                  href={tab.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onFocus={() => setHoveredIndex(index)}
                  onBlur={() => setHoveredIndex(null)}
                  className={cn(
                    "hit flex h-9 items-center whitespace-nowrap rounded-full px-3 text-sm font-medium leading-5 transition-colors duration-300 motion-reduce:transition-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    tab.tone === "support"
                      ? "text-support"
                      : active ? "text-text" : "text-text-secondary hover:text-text"
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
})
Tabs.displayName = "Tabs"

export { Tabs }
