# Onus component references

Companion to docs/PRD.md. Save this file in the repo as **docs/components.md**.

These are the reference components Farnaz chose, copied here verbatim so nobody has to paste them again. They are **direction, not final code**. For every component:

1. Install it as described, into `components/ui/` (shadcn structure, Tailwind v4, TypeScript).
2. Then adapt it exactly as the "Onus adaptation" note says and as the matching PRD section says. The PRD wins any conflict.
3. Replace every hard-coded color with Onus tokens, every placeholder text with real Onus copy, and remove every stock image, fake avatar, fake count, and `#` link. Never "fill image assets with Unsplash stock images" (the original prompts say to; for Onus that is overruled by the Real data only rule).
4. Keep each component's prefers-reduced-motion handling, or add it if missing.

Contents: 1 Theme toggle (CrisisConnect) · 2 Dotted map hero (CrisisConnect) · 3 Count-up stat (CrisisConnect) · 4 Get started steps (CrisisConnect) · 5 Number ticker · 6 Sign in · 7 Ask box · 8 Their words (scroll burn text) · 9 Badges · 10 Footer · Not used: scroll expansion hero.

---

## 1. Theme toggle with circle reveal (from CrisisConnect)

**Where:** nav bar, every page. **PRD:** Design system, Light and dark mode.
**Install:** `lucide-react` (already used by shadcn). Source: CrisisConnect `frontend/src/registry/magicui/animated-theme-toggler.tsx` (originally Magic UI).
**Onus adaptation:** keep as is, with three changes: (1) duration 450 and easing ease-out; (2) wrap `localStorage` in try/catch; (3) skip the animation and switch instantly when `prefers-reduced-motion: reduce`. First load follows the system setting with no animation (set the `dark` class in a small inline script in the root layout before paint, so there is no flash). Use Onus tokens for hover, not `bg-accent` defaults.

```tsx

import { useCallback, useEffect, useRef, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { flushSync } from "react-dom"
import { cn } from "@/lib/utils"

interface AnimatedThemeTogglerProps extends React.ComponentPropsWithoutRef<"button"> {
  duration?: number
}

export const AnimatedThemeToggler = ({
  className,
  duration = 400,
  ...props
}: AnimatedThemeTogglerProps) => {
  const [isDark, setIsDark] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"))
    }
    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  const toggleTheme = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const { top, left, width, height } = button.getBoundingClientRect()
    const x = left + width / 2
    const y = top + height / 2
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const maxRadius = Math.hypot(Math.max(x, viewportWidth - x), Math.max(y, viewportHeight - y))

    const applyTheme = () => {
      const newTheme = !isDark
      setIsDark(newTheme)
      document.documentElement.classList.toggle("dark")
      localStorage.setItem("theme", newTheme ? "dark" : "light")
    }

    if (typeof document.startViewTransition !== "function") {
      applyTheme()
      return
    }

    const transition = document.startViewTransition(() => { flushSync(applyTheme) })
    const ready = transition?.ready
    if (ready && typeof ready.then === "function") {
      ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`] },
          { duration, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" }
        )
      })
    }
  }, [isDark, duration])

  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={toggleTheme}
      className={cn(
        "rounded-md p-2 transition-colors hover:bg-accent hover:text-accent-foreground text-foreground",
        className
      )}
      {...props}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
```

---

## 2. Dotted map hero backdrop (from CrisisConnect)

**Where:** homepage hero backdrop and, faintly, behind the Sign in card. **PRD:** Homepage hero.
**Install:** `npm i svg-dotted-map`. Source: CrisisConnect `frontend/src/registry/magicui/dotted-map.tsx` (a customized Magic UI DottedMap). It already shows 5 random pulsing dots at a time, which is close to the Onus hero.
**Onus adaptation:**
- Crop to BC. The projection is plain equirectangular (`toXY`), so crop by setting the SVG viewBox to the box made by `toXY` of these bounds: latitude 48.2 to 57.0, longitude -132.0 to -114.0 (covers every public institution from Victoria to Dawson Creek and Terrace). Raise `mapSamples` (try 20000 to 40000) so the cropped area still has a dense, even dot field; tune until the coastline reads clearly.
- Replace `PULSE_POOL` with the real school coordinates from `data/institutions.json` (every public institution, UBC twice). No other markers.
- Replace the pulse logic: instead of re-picking 5 dots every 2800ms in sync, give each school its own independent timer with a random delay and a random cycle of 3 to 6 seconds (fade in, hold, fade out), with about 5 lit at any moment and never two neighbours in a row. Soft glow in teal (`--brand`), not a red ring.
- Land dots use the hairline or secondary text token at low opacity so the whole map sits at 10 to 15 percent presence. No hard-coded hex (`#d4d4e8`, `#1c1c2e`, `#4a9eff`, `#e05a4e` all go).
- prefers-reduced-motion: no pulsing; school dots shown faint and still.

Usage idea Farnaz shared (Magic UI demo):

```tsx

import { DottedMap } from "@/registry/magicui/dotted-map"
import type { Marker } from "@/registry/magicui/dotted-map"

const markers: Marker[] = [
  {
    lat: 37.5665,
    lng: 126.978,
    size: 0.3,
  },
  {
    lat: 40.7128,
    lng: -74.006,
    size: 0.3,
    pulse: false,
  },
]

export function Component() {
  return (
    <div className="relative h-[500px] w-full overflow-hidden rounded-lg border">
      <div className="to-background absolute inset-0 bg-radial from-transparent to-200%" />
      <DottedMap markers={markers} pulse />
    </div>
  )
}
```

CrisisConnect's customized source:

```tsx

"use client"

import * as React from "react"
import { createMap } from "svg-dotted-map"
import { cn } from "@/lib/utils"

interface Marker {
  lat: number
  lng: number
  size?: number
}

interface DottedMapProps {
  markers?: Marker[]
  className?: string
}

const W = 150
const H = 75

const PULSE_POOL = [
  { lat: 51.5, lng: -0.1 },
  { lat: 48.8, lng: 2.35 },
  { lat: 40.7, lng: -74.0 },
  { lat: 34.0, lng: -118.2 },
  { lat: 35.6, lng: 139.6 },
  { lat: 55.7, lng: 37.6 },
  { lat: 28.6, lng: 77.2 },
  { lat: 1.3, lng: 103.8 },
  { lat: -23.5, lng: -46.6 },
  { lat: -33.8, lng: 151.2 },
  { lat: 19.4, lng: -99.1 },
  { lat: 52.5, lng: 13.4 },
  { lat: -26.2, lng: 28.0 },
  { lat: 25.2, lng: 55.3 },
  { lat: 37.5, lng: 127.0 },
]

const PULSE_COUNT = 5
const PULSE_INTERVAL = 2800

function toXY(lat: number, lng: number) {
  return {
    x: ((lng + 180) / 360) * W,
    y: ((90 - lat) / 180) * H,
  }
}

function useIsDark() {
  const [dark, setDark] = React.useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  )
  React.useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark"))
    )
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => obs.disconnect()
  }, [])
  return dark
}

export function DottedMap({ markers = [], className }: DottedMapProps) {
  const isDark = useIsDark()

  const mapData = React.useMemo(
    () => createMap({ width: W, height: H, mapSamples: 5000 }),
    []
  )

  const processedMarkers = React.useMemo(
    () => mapData.addMarkers(markers),
    [markers]
  )

  const { xStep, yToRowIndex } = React.useMemo(() => {
    const sorted = [...mapData.points].sort((a, b) => a.y - b.y || a.x - b.x)
    const rowMap = new Map<number, number>()
    let step = 0
    let prevY = NaN
    let prevX = NaN
    for (const p of sorted) {
      if (p.y !== prevY) {
        prevY = p.y
        prevX = NaN
        if (!rowMap.has(p.y)) rowMap.set(p.y, rowMap.size)
      }
      if (!isNaN(prevX)) {
        const d = p.x - prevX
        if (d > 0) step = step === 0 ? d : Math.min(step, d)
      }
      prevX = p.x
    }
    return { xStep: step || 1, yToRowIndex: rowMap }
  }, [mapData.points])

  const [active, setActive] = React.useState<Set<number>>(new Set())

  React.useEffect(() => {
    const pick = () => {
      const pool = PULSE_POOL.map((_, i) => i)
      const chosen = new Set<number>()
      while (chosen.size < PULSE_COUNT && pool.length > 0) {
        const i = Math.floor(Math.random() * pool.length)
        chosen.add(pool.splice(i, 1)[0])
      }
      setActive(chosen)
    }
    pick()
    const id = setInterval(pick, PULSE_INTERVAL)
    return () => clearInterval(id)
  }, [])

  const dotColor = isDark ? "#d4d4e8" : "#1c1c2e"
  const markerColor = isDark ? "#4a9eff" : "#1a6fd4"
  const red = "#e05a4e"

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", display: "block" }}
      className={cn(className)}
    >
      {mapData.points.map((p, i) => {
        const row = yToRowIndex.get(p.y) ?? 0
        const ox = row % 2 === 1 ? xStep / 2 : 0
        return (
          <circle
            key={i}
            cx={p.x + ox}
            cy={p.y}
            r={0.22}
            fill={dotColor}
          />
        )
      })}

      {processedMarkers.map((m, i) => {
        const row = yToRowIndex.get(m.y) ?? 0
        const ox = row % 2 === 1 ? xStep / 2 : 0
        return (
          <circle
            key={i}
            cx={m.x + ox}
            cy={m.y}
            r={m.size ?? 0.5}
            fill={markerColor}
          />
        )
      })}

      {PULSE_POOL.map((coord, i) => {
        if (!active.has(i)) return null
        const { x, y } = toXY(coord.lat, coord.lng)
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={0.4} fill={red} />
            <circle
              cx={x}
              cy={y}
              r={0.4}
              fill="none"
              stroke={red}
              strokeWidth={0.15}
              style={{
                animation: `dmPulse ${PULSE_INTERVAL}ms ease-out infinite`,
              }}
            />
          </g>
        )
      })}

      <style>{`
        @keyframes dmPulse {
          0%   { r: 0.4; opacity: 0.8; }
          70%  { r: 2.2; opacity: 0;   }
          100% { r: 0.4; opacity: 0;   }
        }
      `}</style>
    </svg>
  )
}
```

---

## 3. Count-up stat (from CrisisConnect)

**Where:** homepage numbers section (8%, 6%, 19%). **PRD:** Homepage, second screen.
**Onus adaptation:** keep the IntersectionObserver trigger (threshold 0.3, once). Render the number with NumberFlow (section 5) instead of the setInterval counter, so digits roll smoothly. Remove the bordered card (`rounded-xl border bg-card`) and the tiny uppercase mono label: number in large type, label as one plain sentence under it, source in small grey. Separate stats with space, not boxes.

```tsx

function useCountUp(target: number, duration = 2000, active = false) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!active) return
    let start = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration, active])
  return count
}

function StatCard({ num, suffix, label, sub }: { num: number; suffix: string; label: string; sub: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const count = useCountUp(num, 1800, active)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setActive(true) }, { threshold: 0.3 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className="p-6 rounded-xl border border-border bg-card">
      <div className="font-serif text-3xl font-black text-foreground">{count}{suffix}</div>
      <div className="font-mono text-[10px] text-primary uppercase tracking-widest mt-1">{label}</div>
      <div className="text-xs text-muted-foreground mt-2 leading-relaxed">{sub}</div>
    </div>
  )
}
```

---

## 4. Get started steps (from CrisisConnect "How it works")

**Where:** homepage section 4, right after Their words. **PRD:** Homepage, fourth screen: get started.
**Onus adaptation:** same layout: sticky heading and buttons on the left, numbered vertical steps on the right with a line connecting the circles. Change: Onus copy and buttons from the PRD; heading in Instrument Serif, normal case (not all caps, not font-black); step circles in the brand tint with brand text, not solid fill; connecting line as a plain hairline, not dashed; remove the gradient top border, the uppercase mono eyebrow, and the uppercase mono button text (button label in the system font, sentence case, capsule).

```tsx

const STEPS = [ /* replace with the Onus steps in the PRD */ ]

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="relative w-full border-t border-border py-24 px-8 md:px-14 lg:px-20 bg-background">
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(to right, transparent, oklch(0.460 0.056 252.671), transparent)" }} />

        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-16 lg:gap-24 items-start">

          {/* Left — sticky heading */}
          <div className="lg:w-[38%] flex-shrink-0 lg:sticky lg:top-24">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.3em] mb-4">Step by step</p>
            <h2 className="font-serif font-black uppercase tracking-tight text-foreground leading-[0.9]"
              style={{ fontSize: "clamp(2.5rem, 4.5vw, 5rem)" }}>
              HOW<br /><span className="text-primary">IT WORKS</span>
            </h2>
            <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
              When something urgent happens, every minute matters. CrisisConnect helps neighbors
              quickly report needs, offer support, and coordinate safely in one place.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 mt-10">
              <a href="/app"
                className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] bg-primary text-primary-foreground rounded-full px-6 py-3 hover:bg-primary/90 transition-colors duration-300">
                Get Started
              </a>
            
            </div>
            <p className="mt-6 font-mono text-[10px] text-muted-foreground/50 uppercase tracking-widest">
              No noise. No middleman.<br />Just neighbors helping neighbors.
            </p>
          </div>

          {/* Right — vertical step list */}
          <div className="flex-1 min-w-0">
            {STEPS.map((step, i) => (
              <div key={i} className="relative flex gap-6">
                {/* Circle + dashed line */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 z-10 bg-primary text-primary-foreground">
                    {i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="w-px flex-1 my-2 border-l-2 border-dashed border-border" style={{ minHeight: "48px" }} />
                  )}
                </div>

                {/* Text */}
                <div className="pb-12">
                  <h3 className="font-serif font-black uppercase text-foreground leading-tight mb-2"
                    style={{ fontSize: "clamp(1.1rem, 2vw, 1.5rem)" }}>
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>
```

---

## 5. Number ticker (NumberFlow)

**Where:** homepage stats, and each school's Onus count in the panel (ticks 0 to 1 when a judge rates). **PRD:** UI component references; Gaps, Live rating count.
**Onus adaptation:** keep NumberFlow. Remove the always-on green ping. Instead, a small teal dot pulses once only when the value changes. `tabular-nums`. Under reduced motion NumberFlow's animation is off (pass `animated={false}` or respect its built-in reduced-motion setting). Delete the demo's random interval; values come from real data and Supabase Realtime.


Copy-paste this component to /components/ui folder:
```tsx
number-ticker-05.tsx
"use client";

import NumberFlow, { type Value } from "@number-flow/react";
import { cn } from "@/lib/utils";

type NumberTickerProps = {
  value: Value;
  label?: string;
  decimals?: number;
  className?: string;
};

/**
 * NumberTicker 05 - Stats Counter
 * High-fidelity statistics tracker.
 */
function NumberTicker({
  value,
  label,
  decimals = 0,
  className,
}: NumberTickerProps) {
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
      </span>
      <NumberFlow
        value={value}
        format={{
          notation: "standard",
          compactDisplay: "short",
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }}
        className={className}
      />
      {label && (
        <span className="text-muted-foreground text-sm font-medium">
          {label}
        </span>
      )}
    </div>
  );
}

export default NumberTicker;


demo.tsx
"use client";

import NumberTicker from "@/components/ui/number-ticker-05";
import { useEffect, useState } from "react";

const NumberTickerDemo = () => {
  const [val, setVal] = useState(48250);

  useEffect(() => {
    const interval = setInterval(() => {
      setVal((v) => Number(v) + Math.floor(Math.random() * 50));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <NumberTicker
        value={val}
        label="active users"
        className="text-foreground font-medium lg:text-5xl sm:text-4xl text-3xl tabular-nums"
      />
    </div>
  );
};

export default NumberTickerDemo;

```

Install NPM dependencies:
```bash
@number-flow/react
```

---

## 6. Sign in

**Where:** /signin. **PRD:** Accounts, Sign in; Sign in page spec.
**Onus adaptation (big changes):** keep the centered floating glass card, the logo spot (Onus wordmark instead of the image), the hairline divider, the full-width capsule button, and the inline error line. Remove: password field, "Continue with Google", "Sign up, it's free!", the avatar row and "Join thousands of developers" (invented social proof), the gradient card background, all hex colors, and the `alert()` demo. Flow and copy are in the PRD's Sign in page spec (school email, then six code boxes, quiet Judge access link). Background: the BC dotted map at very low presence.


```tsx
modern-stunning-sign-in.tsx
"use client";

import * as React from "react";
import { useState } from "react";

const SignIn1 = () => {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSignIn = () => {
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    alert("Sign in successful! (Demo)");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#121212] relative overflow-hidden w-full rounded-xl">
      {/* Centered glass card */}
      <div className="relative z-10 w-full max-w-sm rounded-3xl bg-gradient-to-r from-[#ffffff10] to-[#121212] backdrop-blur-sm  shadow-2xl p-8 flex flex-col items-center">
        {/* Logo */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 mb-6 shadow-lg">
          <img src="https://cdn.21st.dev/assets/localized/92db5b0ae3b97eefb3308b3ad28645caaaf0a5125369b81c7cb8a8df1a610043.svg" />
        </div>
        {/* Title */}
        <h2 className="text-2xl font-semibold text-white mb-6 text-center">
          HextaUI
        </h2>
        {/* Form */}
        <div className="flex flex-col w-full gap-4">
          <div className="w-full flex flex-col gap-3">
            <input
              placeholder="Email"
              type="email"
              value={email}
              className="w-full px-5 py-3 rounded-xl  bg-white/10 text-white placeholder-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              className="w-full px-5 py-3 rounded-xl  bg-white/10 text-white placeholder-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <div className="text-sm text-red-400 text-left">{error}</div>
            )}
          </div>
          <hr className="opacity-10" />
          <div>
            <button
              onClick={handleSignIn}
              className="w-full bg-white/10 text-white font-medium px-5 py-3 rounded-full shadow hover:bg-white/20 transition mb-3  text-sm"
            >
              Sign in
            </button>
            {/* Google Sign In */}
            <button className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-[#232526] to-[#2d2e30] rounded-full px-5 py-3 font-medium text-white shadow hover:brightness-110 transition mb-2 text-sm">
              <img
                src="https://cdn.21st.dev/assets/mirror/38/38146bfd9eff6dbf0d74771f2e625c70d87d3770e0d080dbb6e50db1d5403f46.svg"
                alt="Google"
                className="w-5 h-5"
              />
              Continue with Google
            </button>
            <div className="w-full text-center mt-2">
              <span className="text-xs text-gray-400">
                Don&apos;t have an account?{" "}
                <a
                  href="#"
                  className="underline text-white/80 hover:text-white"
                >
                  Sign up, it&apos;s free!
                </a>
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* User count and avatars */}
      <div className="relative z-10 mt-12 flex flex-col items-center text-center">
        <p className="text-gray-400 text-sm mb-2">
          Join <span className="font-medium text-white">thousands</span> of
          developers who are already using HextaUI.
        </p>
        <div className="flex">
          <img
            src="https://cdn.21st.dev/assets/mirror/a6/a634d4f02fe5b77804943c1d74b8d70e35ffe26454e0e9af9717432a2c72bfde.jpg"
            alt="user"
            className="w-8 h-8 rounded-full border-2 border-[#181824] object-cover"
          />
          <img
            src="https://cdn.21st.dev/assets/mirror/d8/d8dab29a5736d5c2b0084d720d3db02c785560071609be501541922928fdf831.jpg"
            alt="user"
            className="w-8 h-8 rounded-full border-2 border-[#181824] object-cover"
          />
          <img
            src="https://cdn.21st.dev/assets/mirror/d1/d1a3e08d4e37d6ee2b7de1db8df87c1dc7acd8ffb004caaf980917de518a60c9.jpg"
            alt="user"
            className="w-8 h-8 rounded-full border-2 border-[#181824] object-cover"
          />
          <img
            src="https://cdn.21st.dev/assets/mirror/f0/f07b84f12ef125cbb837a7bd64da401992f5f62bd55fee10d01cd3dcc8abae80.jpg"
            alt="user"
            className="w-8 h-8 rounded-full border-2 border-[#181824] object-cover"
          />
        </div>
      </div>
    </div>
  );
};

export { SignIn1 };

export default SignIn1;


demo.tsx
import { SignIn1 } from "@/components/ui/modern-stunning-sign-in";

function Demo() {
  return <SignIn1 />;
}

export { Demo };

export default Demo;

```

---

## 7. Ask box

**Where:** the Ask sheet in each school's panel. **PRD:** Ask about this policy agent; UI component references.
**Onus adaptation:** keep the auto-growing textarea (max about 200px), the mic button, and the round send button that is disabled until there is text, plus the tooltips. Remove: image attach (plus button, file input, image preview dialog), the Tools popover and `toolsList` with all its icons, the active-tool chip, and every hard-coded color (`#303030`, `#515151`, `#2294ff`, `#99ceff`, `bg-black`). Placeholder: "Ask about [School]'s policy". Mic starts voice mode (record, then /api/voice/transcribe, then /api/ask, then /api/voice/speak). Enter sends, Shift+Enter adds a line. Use the project's `cn` from `@/lib/utils` instead of the inline one.


Copy-paste this component to /components/ui folder:
```tsx
chatgpt-prompt-input.tsx
// component.tsx
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as DialogPrimitive from "@radix-ui/react-dialog";

// --- Utility Function & Radix Primitives (Unchanged) ---
type ClassValue = string | number | boolean | null | undefined;
function cn(...inputs: ClassValue[]): string { return inputs.filter(Boolean).join(" "); }
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef<React.ElementRef<typeof TooltipPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { showArrow?: boolean }>(({ className, sideOffset = 4, showArrow = false, ...props }, ref) => ( <TooltipPrimitive.Portal><TooltipPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn("relative z-50 max-w-[280px] rounded-md bg-popover text-popover-foreground px-1.5 py-1 text-xs animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", className)} {...props}>{props.children}{showArrow && <TooltipPrimitive.Arrow className="-my-px fill-popover" />}</TooltipPrimitive.Content></TooltipPrimitive.Portal>));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverContent = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(({ className, align = "center", sideOffset = 4, ...props }, ref) => ( <PopoverPrimitive.Portal><PopoverPrimitive.Content ref={ref} align={align} sideOffset={sideOffset} className={cn("z-50 w-64 rounded-xl bg-popover dark:bg-[#303030] p-2 text-popover-foreground dark:text-white shadow-md outline-none animate-in data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", className)} {...props} /></PopoverPrimitive.Portal>));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(({ className, ...props }, ref) => ( <DialogPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)} {...props} />));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(({ className, children, ...props }, ref) => ( <DialogPortal><DialogOverlay /><DialogPrimitive.Content ref={ref} className={cn("fixed left-[50%] top-[50%] z-50 grid w-full max-w-[90vw] md:max-w-[800px] translate-x-[-50%] translate-y-[-50%] gap-4 border-none bg-transparent p-0 shadow-none duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95", className)} {...props}><div className="relative bg-card dark:bg-[#303030] rounded-[28px] overflow-hidden shadow-2xl p-1">{children}<DialogPrimitive.Close className="absolute right-3 top-3 z-10 rounded-full bg-background/50 dark:bg-[#303030] p-1 hover:bg-accent dark:hover:bg-[#515151] transition-all"><XIcon className="h-5 w-5 text-muted-foreground dark:text-gray-200 hover:text-foreground dark:hover:text-white" /><span className="sr-only">Close</span></DialogPrimitive.Close></div></DialogPrimitive.Content></DialogPortal>));
DialogContent.displayName = DialogPrimitive.Content.displayName;

// --- SVG Icon Components ---
const PlusIcon = (props: React.SVGProps<SVGSVGElement>) => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}> <path d="M12 5V19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> <path d="M5 12H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> </svg> );
const Settings2Icon = (props: React.SVGProps<SVGSVGElement>) => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}> <path d="M20 7h-9" /> <path d="M14 17H5" /> <circle cx="17" cy="17" r="3" /> <circle cx="7" cy="7" r="3" /> </svg> );
const SendIcon = (props: React.SVGProps<SVGSVGElement>) => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}> <path d="M12 5.25L12 18.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> <path d="M18.75 12L12 5.25L5.25 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> </svg> );
const XIcon = (props: React.SVGProps<SVGSVGElement>) => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}> <line x1="18" y1="6" x2="6" y2="18" /> <line x1="6" y1="6" x2="18" y2="18" /> </svg> );
const GlobeIcon = (props: React.SVGProps<SVGSVGElement>) => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>);
const PencilIcon = (props: React.SVGProps<SVGSVGElement>) => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>);
const PaintBrushIcon = (props: React.SVGProps<SVGSVGElement>) => ( <svg viewBox="0 0 512 512" fill="currentColor" {...props}> <g> <path d="M141.176,324.641l25.323,17.833c7.788,5.492,17.501,7.537,26.85,5.67c9.35-1.877,17.518-7.514,22.597-15.569l22.985-36.556l-78.377-55.222l-26.681,33.96c-5.887,7.489-8.443,17.081-7.076,26.511C128.188,310.69,133.388,319.158,141.176,324.641z"/> <path d="M384.289,64.9c9.527-15.14,5.524-35.06-9.083-45.355l-0.194-0.129c-14.615-10.296-34.728-7.344-45.776,6.705L170.041,228.722l77.067,54.292L384.289,64.9z"/> <path d="M504.745,445.939c-4.011,0-7.254,3.251-7.254,7.262s3.243,7.246,7.254,7.246c4.012,0,7.255-3.235,7.255-7.246S508.757,445.939,504.745,445.939z"/> <path d="M457.425,432.594c3.914,0,7.092-3.179,7.092-7.101c0-3.898-3.178-7.077-7.092-7.077c-3.915,0-7.093,3.178-7.093,7.077C450.332,429.415,453.51,432.594,457.425,432.594z"/> <path d="M164.493,440.972c14.671-20.817,16.951-48.064,5.969-71.089l-0.462-0.97l-54.898-38.675l-1.059-0.105c-25.379-2.596-50.256,8.726-64.928,29.552c-13.91,19.742-18.965,41.288-23.858,62.113c-3.333,14.218-6.778,28.929-13.037,43.05c-5.168,11.695-8.63,15.868-8.654,15.884L0,484.759l4.852,2.346c22.613,10.902,53.152,12.406,83.779,4.156C120.812,482.584,147.76,464.717,164.493,440.972z M136.146,446.504c-0.849,0.567-1.714,1.19-2.629,1.892c-10.06,7.91-23.17,4.505-15.188-11.54c7.966-16.054-6.09-21.198-17.502-10.652c-14.323,13.232-21.044,2.669-18.391-4.634c2.636-7.304,12.155-17.267,4.189-23.704c-4.788-3.882-10.967,1.795-20.833,9.486c-5.645,4.392-18.666,2.968-13.393-16.563c2.863-7.271,6.389-14.275,11.104-20.971c10.24-14.542,27.603-23.083,45.404-22.403l47.021,33.11c6.632,16.548,4.416,35.764-5.823,50.305C146.167,436.411,141.476,441.676,136.146,446.504z"/> <path d="M471.764,441.992H339.549c-0.227-0.477-0.38-1.003-0.38-1.57c0-0.913,0.372-1.73,0.93-2.378h81.531c5.848,0,10.578-4.723,10.578-10.578c0-5.84-4.73-10.571-10.578-10.571H197.765c0.308,15.399-4.116,30.79-13.271,43.786c-11.218,15.925-27.214,28.913-46.196,38.036h303.802c6.551,0,11.864-5.314,11.864-11.872c0-6.559-5.314-11.873-11.864-11.873h-55.392c-3.299,0-5.977-2.668-5.977-5.968c0-1.246,0.47-2.313,1.1-3.267h89.934c6.559,0,11.881-5.305,11.881-11.873C483.645,447.306,478.323,441.992,471.764,441.992z"/> </g> </svg> );
const TelescopeIcon = (props: React.SVGProps<SVGSVGElement>) => ( <svg viewBox="0 0 512 512" fill="currentColor" {...props}> <g> <path d="M452.425,202.575l-38.269-23.11c-1.266-10.321-5.924-18.596-13.711-21.947l-86.843-52.444l-0.275,0.598c-3.571-7.653-9.014-13.553-16.212-16.668L166.929,10.412l-0.236,0.543v-0.016c-3.453-2.856-7.347-5.239-11.594-7.08C82.569-10.435,40.76,14.5,21.516,59.203C2.275,103.827,12.82,151.417,45.142,165.36c4.256,1.826,8.669,3.005,13.106,3.556l-0.19,0.464l146.548,40.669c7.19,3.107,15.206,3.004,23.229,0.37l-0.236,0.566L365.55,238.5c7.819,3.366,17.094,1.125,25.502-5.082l42.957,11.909c7.67,3.312,18.014-3.548,23.104-15.362C462.202,218.158,460.11,205.894,452.425,202.575z M154.516,99.56c-11.792,27.374-31.402,43.783-47.19,49.132c-6.962,2.281-13.176,2.556-17.605,0.637c-14.536-6.254-25.235-41.856-8.252-81.243c16.976-39.378,50.186-56.055,64.723-49.785c4.429,1.904,8.519,6.592,11.626,13.246C164.774,46.699,166.3,72.216,154.516,99.56z"/> <path d="M297.068,325.878c-1.959-2.706-2.25-6.269-0.724-9.25c1.518-2.981,4.562-4.846,7.913-4.846h4.468c4.909,0,8.889-3.972,8.889-8.897v-7.74c0-4.909-3.98-8.897-8.889-8.897h-85.789c-4.908,0-8.897,3.988-8.897,8.897v7.74c0,4.925,3.989,8.897,8.897,8.897h4.492c3.344,0,6.388,1.865,7.914,4.846c1.518,2.981,1.235,6.544-0.732,9.25L128.715,459.116c-3.225,4.287-2.352,10.36,1.927,13.569c4.295,3.225,10.368,2.344,13.578-1.943l107.884-122.17l4.036,153.738c0,5.333,4.342,9.691,9.691,9.691c5.358,0,9.692-4.358,9.692-9.691l4.043-153.738l107.885,122.17c3.209,4.287,9.282,5.168,13.568,1.943c4.288-3.209,5.145-9.282,1.951-13.569L297.068,325.878z"/> <path d="M287.227,250.81c0-11.807-9.573-21.388-21.396-21.388c-11.807,0-21.38,9.582-21.38,21.388c0,11.831,9.574,21.428,21.38,21.428C277.654,272.238,287.227,262.642,287.227,250.81z"/> </g> </svg> );
const LightbulbIcon = (props: React.SVGProps<SVGSVGElement>) => ( <svg viewBox="0 0 24 24" fill="none" {...props}> <path d="M12 7C9.23858 7 7 9.23858 7 12C7 13.3613 7.54402 14.5955 8.42651 15.4972C8.77025 15.8484 9.05281 16.2663 9.14923 16.7482L9.67833 19.3924C9.86537 20.3272 10.6862 21 11.6395 21H12.3605C13.3138 21 14.1346 20.3272 14.3217 19.3924L14.8508 16.7482C14.9472 16.2663 15.2297 15.8484 15.5735 15.4972C16.456 14.5955 17 13.3613 17 12C17 9.23858 14.7614 7 12 7Z" stroke="currentColor" strokeWidth="2"/> <path d="M12 4V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> <path d="M18 6L19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> <path d="M20 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> <path d="M4 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> <path d="M5 5L6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> <path d="M10 17H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> </svg> );
// NEW: MicIcon
const MicIcon = (props: React.SVGProps<SVGSVGElement>) => ( <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}> <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path> <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path> <line x1="12" y1="19" x2="12" y2="23"></line> </svg> );


const toolsList = [ { id: 'createImage', name: 'Create an image', shortName: 'Image', icon: PaintBrushIcon }, { id: 'searchWeb', name: 'Search the web', shortName: 'Search', icon: GlobeIcon }, { id: 'writeCode', name: 'Write or code', shortName: 'Write', icon: PencilIcon }, { id: 'deepResearch', name: 'Run deep research', shortName: 'Deep Search', icon: TelescopeIcon, extra: '5 left' }, { id: 'thinkLonger', name: 'Think for longer', shortName: 'Think', icon: LightbulbIcon }, ];

// --- The Final, Self-Contained PromptBox Component ---
export const PromptBox = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    // ... all state and handlers are unchanged ...
    const internalTextareaRef = React.useRef<HTMLTextAreaElement>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [value, setValue] = React.useState("");
    const [imagePreview, setImagePreview] = React.useState<string | null>(null);
    const [selectedTool, setSelectedTool] = React.useState<string | null>(null);
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [isImageDialogOpen, setIsImageDialogOpen] = React.useState(false);
    React.useImperativeHandle(ref, () => internalTextareaRef.current!, []);
    React.useLayoutEffect(() => { const textarea = internalTextareaRef.current; if (textarea) { textarea.style.height = "auto"; const newHeight = Math.min(textarea.scrollHeight, 200); textarea.style.height = `${newHeight}px`; } }, [value]);
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => { setValue(e.target.value); if (props.onChange) props.onChange(e); };
    const handlePlusClick = () => { fileInputRef.current?.click(); };
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file && file.type.startsWith("image/")) { const reader = new FileReader(); reader.onloadend = () => { setImagePreview(reader.result as string); }; reader.readAsDataURL(file); } event.target.value = ""; };
    const handleRemoveImage = (e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setImagePreview(null); if(fileInputRef.current) { fileInputRef.current.value = ""; } };
    const hasValue = value.trim().length > 0 || imagePreview;
    const activeTool = selectedTool ? toolsList.find(t => t.id === selectedTool) : null;
    const ActiveToolIcon = activeTool?.icon;

    return (
      <div className={cn("flex flex-col rounded-[28px] p-2 shadow-sm transition-colors bg-white border dark:bg-[#303030] dark:border-transparent cursor-text", className)}>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*"/>
        
        {imagePreview && ( <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}> <div className="relative mb-1 w-fit rounded-[1rem] px-1 pt-1"> <button type="button" className="transition-transform" onClick={() => setIsImageDialogOpen(true)}> <img src={imagePreview} alt="Image preview" className="h-14.5 w-14.5 rounded-[1rem]" /> </button> <button onClick={handleRemoveImage} className="absolute right-2 top-2 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-white/50 dark:bg-[#303030] text-black dark:text-white transition-colors hover:bg-accent dark:hover:bg-[#515151]" aria-label="Remove image"> <XIcon className="h-4 w-4" /> </button> </div> <DialogContent> <img src={imagePreview} alt="Full size preview" className="w-full max-h-[95vh] object-contain rounded-[24px]" /> </DialogContent> </Dialog> )}
        
        <textarea ref={internalTextareaRef} rows={1} value={value} onChange={handleInputChange} placeholder="Message..." className="custom-scrollbar w-full resize-none border-0 bg-transparent p-3 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-gray-300 focus:ring-0 focus-visible:outline-none min-h-12" {...props} />
        
        <div className="mt-0.5 p-1 pt-0">
          <TooltipProvider delayDuration={100}>
            <div className="flex items-center gap-2">
              <Tooltip> <TooltipTrigger asChild><button type="button" onClick={handlePlusClick} className="flex h-8 w-8 items-center justify-center rounded-full text-foreground dark:text-white transition-colors hover:bg-accent dark:hover:bg-[#515151] focus-visible:outline-none"><PlusIcon className="h-6 w-6" /><span className="sr-only">Attach image</span></button></TooltipTrigger> <TooltipContent side="top" showArrow={true}><p>Attach image</p></TooltipContent> </Tooltip>
              
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button type="button" className="flex h-8 items-center gap-2 rounded-full p-2 text-sm text-foreground dark:text-white transition-colors hover:bg-accent dark:hover:bg-[#515151] focus-visible:outline-none focus-visible:ring-ring">
                        <Settings2Icon className="h-4 w-4" />
                        {!selectedTool && 'Tools'}
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" showArrow={true}><p>Explore Tools</p></TooltipContent>
                </Tooltip>
                <PopoverContent side="top" align="start">
                  <div className="flex flex-col gap-1">
                    {toolsList.map(tool => ( <button key={tool.id} onClick={() => { setSelectedTool(tool.id); setIsPopoverOpen(false); }} className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-accent dark:hover:bg-[#515151]"> <tool.icon className="h-4 w-4" /> <span>{tool.name}</span> {tool.extra && <span className="ml-auto text-xs text-muted-foreground dark:text-gray-400">{tool.extra}</span>} </button> ))}
                  </div>
                </PopoverContent>
              </Popover>

              {activeTool && (
                <>
                  <div className="h-4 w-px bg-border dark:bg-gray-600" />
                  <button onClick={() => setSelectedTool(null)} className="flex h-8 items-center gap-2 rounded-full px-2 text-sm dark:hover:bg-[#3b4045] hover:bg-accent cursor-pointer dark:text-[#99ceff] text-[#2294ff] transition-colors flex-row items-center justify-center">
                    {ActiveToolIcon && <ActiveToolIcon className="h-4 w-4" />}
                    {activeTool.shortName}
                    <XIcon className="h-4 w-4" />
                  </button>
                </>
              )}

              {/* MODIFIED: Right-aligned buttons container */}
              <div className="ml-auto flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-foreground dark:text-white transition-colors hover:bg-accent dark:hover:bg-[#515151] focus-visible:outline-none">
                      <MicIcon className="h-5 w-5" />
                      <span className="sr-only">Record voice</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" showArrow={true}><p>Record voice</p></TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="submit" disabled={!hasValue} className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80 disabled:bg-black/40 dark:disabled:bg-[#515151]">
                      <SendIcon className="h-6 w-6 text-bold" />
                      <span className="sr-only">Send message</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" showArrow={true}><p>Send</p></TooltipContent>
                </Tooltip>
              </div>
            </div>
          </TooltipProvider>
        </div>
      </div>
    );
  }
);
PromptBox.displayName = "PromptBox";

demo.tsx
import { PromptBox } from "@/components/ui/chatgpt-prompt-input";

export function PromptBoxDemo() {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const message = formData.get("message");
    // In a real app, you would also handle the uploaded file here.
    if (!message && !event.currentTarget.querySelector('img')) {
      return;
    }
    alert(`Message Submitted!`);
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background dark:bg-[#212121] p-4">
      <div className="w-full max-w-xl flex flex-col gap-10">
          <p className="text-center text-3xl text-foreground">
            How Can I Help You
          </p>
          <PromptBox />
      </div>
    </div>
  );
}
```

Install NPM dependencies:
```bash
@radix-ui/react-dialog, @radix-ui/react-popover, @radix-ui/react-tooltip
```

Extend existing Tailwind 4 index.css with this code (or if project uses Tailwind 3, extend tailwind.config.js or globals.css):
```css
@import "tailwindcss";
@import "tw-animate-css";

:root {
  --radius: 0.65rem;
}

```

---

## 8. Their words (scroll burn text)

**Where:** homepage section 3. **PRD:** Homepage, third screen: their words.
**Onus adaptation:** keep the scroll-driven, one-block-at-a-time approach, the dissolve from the middle outward, the sticky full-screen frame, the counter, the `sr-only` full text, the reduced-motion fallback, and the passive scroll listener with requestAnimationFrame. Change: `runway` about 120vh; text in Instrument Serif, normal weight, not bold; quotes come from `data/quotes.json` (each with text, school, year, publication, url, approved: true), and only approved quotes render. After a quote dissolves, its attribution line ("Student, [school], [year], via [publication]") stays visible a beat longer, then fades. Remove: the red and cyan text-shadow split (`--ab` and the `textShadow` style) and the film grain overlay (`GRAIN`). The hint reads "scroll" in small grey sentence case, no uppercase tracking. Do not use the demo's sample paragraphs.


Copy-paste this component to /components/ui folder:
```tsx
scroll-burn-text.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ScrollBurnTextProps {
  /**
   * The blocks, read in order. Each one comes up out of the dark, passes the
   * lens and burns off, uncovering the next one standing behind it.
   */
  sections: string[];
  /** Line shown on the opening frame, before the first block is close enough to read. Fades out on the first flick of scroll. */
  hint?: React.ReactNode;
  /** Scroll distance each block gets. Taller is slower. Default `"170vh"`. */
  runway?: string;
  /** Scrollable ancestor to track instead of the page — pass this when pinning inside a bounded panel. */
  container?: React.RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * Film grain, as a tiled SVG rather than a bitmap: it is the one texture here
 * that has to sit over the whole frame, and a few hundred bytes of turbulence
 * beats shipping a PNG large enough not to visibly repeat. The gamma on alpha
 * is what keeps it grain — raw turbulence averages half opaque, which is a grey
 * wash over the frame rather than specks on it.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='gamma' exponent='4'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")";

/** Progress through a block's own slot at which it starts to burn. */
const BURN_AT = 0.62;
/** How much of the slot the burn takes to eat the block whole. */
const BURN_SPAN = 0.38;
/** Slots of approach before the first block reaches the front. */
const LEAD = 0.7;
/** Alpha of a block still standing behind the one up front. */
const DIM = 0.3;
/**
 * How far into its own fade the first block already is on the opening frame.
 * Without it the runway opens on an empty frame: the first block sits exactly
 * at the start of its ramp, which is zero, and there is nothing to scroll
 * toward. A shape this faint at the far end of the room is the whole cue.
 */
const OPEN = 0.22;
/** Distance a block is born at, in units of the distance it is read at. */
const FAR = 4;
/** Distance it has closed to by the time it is gone — a quarter of reading distance is four times the size. */
const NEAR = 0.25;
/**
 * Burn a single glyph fades over. Kept in step with the `0.09` in the glyph's
 * own opacity, which has to be a literal so Tailwind can see the class.
 */
const RAMP = 0.09;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Tracks `prefers-reduced-motion`. Straight off matchMedia rather than out of an
 * animation library — the burn writes its own styles, so a motion dependency
 * would be carried for this one boolean.
 */
function useReducedMotion() {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduce(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  return reduce;
}

export function ScrollBurnText({
  sections,
  hint = "scroll down",
  runway = "170vh",
  container,
  className,
}: ScrollBurnTextProps) {
  const prefersReducedMotion = useReducedMotion();
  const runwayRef = React.useRef<HTMLDivElement>(null);
  const counterRef = React.useRef<HTMLDivElement>(null);
  const hintRef = React.useRef<HTMLDivElement>(null);
  const blockRefs = React.useRef<(HTMLParagraphElement | null)[]>([]);

  const count = sections.length;

  // Read inside the scroll handler so retyping the copy does not tear the
  // listener down and rebuild it.
  const total = React.useRef(count);
  total.current = count;

  React.useEffect(() => {
    if (prefersReducedMotion) return;
    const el = runwayRef.current;
    if (!el) return;
    const containerEl = container?.current ?? null;
    const win = el.ownerDocument.defaultView ?? window;
    const scroller: HTMLElement | Window = containerEl ?? win;

    // Where a glyph sits in its block is a wrap-time fact, so the burn order is
    // measured once rather than derived from the character index: index order
    // would eat the copy in reading order, which is a wipe, not a burn.
    const measure = () => {
      blockRefs.current.forEach((block) => {
        if (!block) return;
        const w = block.offsetWidth || 1;
        const h = block.offsetHeight || 1;
        (Array.from(block.children) as HTMLElement[]).forEach((node) => {
          const x = (node.offsetLeft + node.offsetWidth / 2) / w;
          const y = (node.offsetTop + node.offsetHeight / 2) / h;
          // Two crossed waves instead of a noise field: they cost two sines and
          // land their blobs at the scale of a few glyphs, which is the bite a
          // real burn takes. A per-glyph random would give static, not holes.
          const blob =
            0.5 +
            0.28 * Math.sin(x * 11.3 + y * 6.1 + 1.7) +
            0.22 * Math.sin(x * 5.7 - y * 13.9 + 4.2);
          // Middle of the block goes first and the corners hold out longest,
          // so the copy is eaten from the inside the way paper takes a flame.
          const middle = Math.hypot(x - 0.5, (y - 0.5) * 1.15) / 0.62;
          node.style.setProperty(
            "--t",
            `${clamp01(0.05 + 0.55 * middle + 0.45 * blob)}`,
          );
        });
      });
    };

    // Only the block that is actually burning needs its progress rewritten. The
    // rest hold at 0 or 1, and writing those every frame would recalculate a few
    // hundred glyph opacities for nothing.
    const burnt: number[] = [];
    let active = -1;
    let raf = 0;

    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const viewport = containerEl ? containerEl.clientHeight : win.innerHeight;
      const top = containerEl
        ? rect.top - containerEl.getBoundingClientRect().top
        : rect.top;
      const p = clamp01(-top / (rect.height - viewport || 1));

      const count = total.current;
      // One slot per block. The runway stops with the last block at the moment
      // its burn would start, so the piece ends on that copy whole rather than
      // on a frame of ash.
      const t = -LEAD + p * (count - 1 + LEAD + BURN_AT);
      let front = 0;

      blockRefs.current.forEach((block, i) => {
        const wrap = block?.parentElement;
        if (!block || !wrap) return;
        const q = t - i;
        if (q > 1) front = Math.min(i + 1, count - 1);

        const alpha =
          clamp01((q + LEAD + OPEN) / 0.45) *
          (DIM + (1 - DIM) * clamp01(q / 0.45));

        // Nothing to paint before it arrives, and nothing left of it once the
        // burn has run — the last block never reaches that, so this only ever
        // clears blocks that are already ash.
        if (alpha <= 0 || q > 1) {
          wrap.style.visibility = "hidden";
          return;
        }
        wrap.style.visibility = "visible";
        wrap.style.opacity = `${alpha}`;
        // A lens, not an easing. Distance falls at a steady rate and size is one
        // over distance, so a block creeps while it is far off and rushes once
        // it is close — the same curve anything coming at you actually follows.
        // Doubling at a fixed rate instead would read as a flat zoom.
        const depth = Math.max(
          FAR - ((FAR - NEAR) * (q + LEAD)) / (1 + LEAD),
          NEAR,
        );
        wrap.style.transform = `scale(${1 / depth})`;

        // Run past 1 by the width of a glyph's own fade, or the glyph holding
        // the highest threshold is still half lit when the burn is over.
        const burn = clamp01((q - BURN_AT) / BURN_SPAN) * (1 + RAMP);
        if (burnt[i] !== burn) {
          burnt[i] = burn;
          block.style.setProperty("--b", `${burn}`);
          // The split follows this block's own burn, so the type comes apart
          // optically at the moment it comes apart physically — and the one
          // arriving behind it stays clean.
          block.style.setProperty("--ab", `${0.35 + burn * 2.6}`);
        }
      });

      // Off by the time the first block is anywhere near readable.
      if (hintRef.current) {
        hintRef.current.style.opacity = `${clamp01(1 - p / 0.08)}`;
      }
      if (active !== front) {
        active = front;
        if (counterRef.current) {
          counterRef.current.textContent = `${String(front + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`;
        }
      }
    };

    const onScroll = () => {
      if (!raf) raf = win.requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    win.addEventListener("resize", onResize);
    // The column re-wraps when the panel does, and every threshold is pinned to
    // where a glyph landed, so a resized panel needs a fresh measure even when
    // nothing scrolled.
    const ro = containerEl ? new ResizeObserver(onResize) : null;
    if (containerEl && ro) ro.observe(containerEl);

    return () => {
      scroller.removeEventListener("scroll", onScroll);
      win.removeEventListener("resize", onResize);
      ro?.disconnect();
      if (raf) win.cancelAnimationFrame(raf);
    };
  }, [prefersReducedMotion, container]);

  // `relative` so the glyphs measure against the block rather than against the
  // frame — they are laid out in the block, but their offsets are reported
  // against the nearest positioned ancestor.
  // The type is sized off the frame rather than off breakpoints, and off the
  // same number as the column: a block has to hold its share of the frame at
  // reading distance, and stepping the size while the column scales smoothly
  // leaves it a third of the height it should be between two breakpoints.
  const column =
    "relative w-[min(84vw,36rem)] text-center text-[clamp(1.25rem,6.5vw,2.75rem)] font-bold leading-[1.05] tracking-tight text-foreground";

  if (prefersReducedMotion) {
    return (
      <div className={cn("w-full bg-background px-6 py-24", className)}>
        <div className="mx-auto grid max-w-2xl gap-10">
          {sections.map((body, i) => (
            <p key={i} className={cn(column, "w-full text-left")}>
              {body}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full bg-background", className)}>
      <div
        ref={runwayRef}
        style={{ height: `calc(${runway} * ${count})` }}
        className="w-full"
      >
        <div className="sticky top-0 h-screen w-full overflow-hidden bg-background">
          <div
            ref={counterRef}
            className="pointer-events-none absolute bottom-5 left-6 z-10 text-[0.65rem] font-medium uppercase tracking-[0.22em] tabular-nums text-muted-foreground"
          />

          {hint ? (
            <div
              ref={hintRef}
              className="pointer-events-none absolute inset-x-0 bottom-16 z-10 text-center"
            >
              {/* The rule under it is the direction. The word alone reads as a
                  label on the frame rather than an instruction to the reader. */}
              <span className="relative text-[0.65rem] font-medium uppercase tracking-[0.22em] text-muted-foreground after:absolute after:left-1/2 after:top-full after:mt-2 after:h-8 after:w-px after:bg-gradient-to-b after:from-muted-foreground/50 after:to-transparent after:content-['']">
                {hint}
              </span>
            </div>
          ) : null}

          {sections.map((body, i) => (
            <div
              key={i}
              // Hidden until the first frame places it, so the blocks never
              // flash stacked on top of each other.
              style={{ visibility: "hidden" }}
              className="absolute inset-0 grid place-items-center will-change-transform"
              aria-hidden
            >
              <p
                ref={(node) => {
                  blockRefs.current[i] = node;
                }}
                className={column}
                style={
                  {
                    "--b": 0,
                    "--ab": 0.35,
                    // The RGB split is two shadows rather than two more copies
                    // of the copy: same fringe, a third of the DOM, and it
                    // widens off the same number that is eating the glyphs.
                    textShadow:
                      "calc(var(--ab) * -1px) 0 rgb(255 45 85 / 0.85), calc(var(--ab) * 1px) 0 rgb(0 225 255 / 0.85)",
                  } as React.CSSProperties
                }
              >
                {Array.from(body).map((ch, k) =>
                  ch === " " ? (
                    " "
                  ) : (
                    // The whole comparison lives in CSS: one custom property on
                    // the block against a threshold baked into each glyph. The
                    // scroll handler writes one value per frame, and the engine
                    // resolves the few hundred that answer to it.
                    <span
                      key={k}
                      className="opacity-[calc((var(--t,1)_+_0.09_-_var(--b,0))*11)]"
                    >
                      {ch}
                    </span>
                  ),
                )}
              </p>
            </div>
          ))}

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-45"
            style={{ backgroundImage: GRAIN, backgroundSize: "180px" }}
          />

          {/* The visual layer is split to the glyph, which assistive tech reads
              as loose letters, so the copy is carried once more intact. */}
          <p className="sr-only">{sections.join(" ")}</p>
        </div>
      </div>
    </div>
  );
}

export default ScrollBurnText;


demo.tsx
// This is a file with a demo for your component
// That's what users will see in the preview
// Create new files in this directory to add more demos
"use client";
 
import { useRef } from "react";
import { ScrollBurnText } from "@/components/ui/scroll-burn-text";
 
const SECTIONS = [
  "Every interface worth using begins as a list of things it refuses to do. The first idea is free and the second one is cheap, so cut them both and keep cutting, well past the point where it starts to feel wasteful, until what is left cannot lose another piece and still stand up on its own.",
  "Type, colour and motion are not a coat of paint you roll on at the end. They are the material the thing is made of, and the only honest way to learn how they behave is to build with them, stand back, and look hard at what you actually made rather than at what you meant to make.",
  "The best change is the one nobody can point at, because the friction it removed was never something anyone had a word for. Nobody writes in to thank you for the step they did not have to take. Ship it anyway, then go looking for the next one, and for the one waiting behind that.",
];
// ONLY DEFAULT EXPORT WILL BE TREATED AS A DEMO
export default function DemoOne() {
  const containerRef = useRef<HTMLDivElement>(null);
 
  return (
    <div
      ref={containerRef}
      className="relative h-screen w-full overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ScrollBurnText sections={SECTIONS} container={containerRef} />
    </div>
  );
}

```

---

## 9. Badges (shadcn Badge)

**Where:** grade letters, gap labels, Policy found, role breakdown. **PRD:** UI component references.
**Install:** `npx shadcn@latest add badge`.
**Onus adaptation:** add Onus variants instead of default, secondary, destructive, outline: `aligned`, `some-gap`, `big-gap`, `no-policy`, `neutral`. Each is a capsule with a tinted fill and colored text from the tokens, always with a word. No outline variant.

```tsx

import { Badge } from "@/components/ui/badge"

export function BadgeDemo() {
  return (
    <div className="flex w-full flex-wrap justify-center gap-2">
      <Badge>Badge</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  )
}
```

---

## 10. Footer

**Where:** every page. **PRD:** Footer (every page).
**Onus adaptation:** keep the wordmark-left, columns-right grid and the staggered fade-up on scroll (`AnimatedContainer`, once, skipped under reduced motion). Replace `footerLinks` entirely with the PRD's three columns (Explore, Get help in purple, About). Remove: the radial gradient background, the blurred line on the top edge, `rounded-t-4xl` and `md:rounded-t-6xl`, `FrameIcon`, the whole Social Links column and its icons, and "Asme. All rights reserved." Bottom row: "© 2026 Onus" and the CARTO and OpenStreetMap attribution. On mobile, Get help stacks first.


Copy-paste this component to /components/ui folder:
```tsx
footer-section.tsx
'use client';
import React from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FacebookIcon, FrameIcon, InstagramIcon, LinkedinIcon, YoutubeIcon } from 'lucide-react';

interface FooterLink {
	title: string;
	href: string;
	icon?: React.ComponentType<{ className?: string }>;
}

interface FooterSection {
	label: string;
	links: FooterLink[];
}

const footerLinks: FooterSection[] = [
	{
		label: 'Product',
		links: [
			{ title: 'Features', href: '#features' },
			{ title: 'Pricing', href: '#pricing' },
			{ title: 'Testimonials', href: '#testimonials' },
			{ title: 'Integration', href: '/' },
		],
	},
	{
		label: 'Company',
		links: [
			{ title: 'FAQs', href: '/faqs' },
			{ title: 'About Us', href: '/about' },
			{ title: 'Privacy Policy', href: '/privacy' },
			{ title: 'Terms of Services', href: '/terms' },
		],
	},
	{
		label: 'Resources',
		links: [
			{ title: 'Blog', href: '/blog' },
			{ title: 'Changelog', href: '/changelog' },
			{ title: 'Brand', href: '/brand' },
			{ title: 'Help', href: '/help' },
		],
	},
	{
		label: 'Social Links',
		links: [
			{ title: 'Facebook', href: '#', icon: FacebookIcon },
			{ title: 'Instagram', href: '#', icon: InstagramIcon },
			{ title: 'Youtube', href: '#', icon: YoutubeIcon },
			{ title: 'LinkedIn', href: '#', icon: LinkedinIcon },
		],
	},
];

export function Footer() {
	return (
		<footer className="md:rounded-t-6xl relative w-full max-w-6xl mx-auto flex flex-col items-center justify-center rounded-t-4xl border-t bg-[radial-gradient(35%_128px_at_50%_0%,theme(backgroundColor.white/8%),transparent)] px-6 py-12 lg:py-16">
			<div className="bg-foreground/20 absolute top-0 right-1/2 left-1/2 h-px w-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full blur" />

			<div className="grid w-full gap-8 xl:grid-cols-3 xl:gap-8">
				<AnimatedContainer className="space-y-4">
					<FrameIcon className="size-8" />
					<p className="text-muted-foreground mt-8 text-sm md:mt-0">
						© {new Date().getFullYear()} Asme. All rights reserved.
					</p>
				</AnimatedContainer>

				<div className="mt-10 grid grid-cols-2 gap-8 md:grid-cols-4 xl:col-span-2 xl:mt-0">
					{footerLinks.map((section, index) => (
						<AnimatedContainer key={section.label} delay={0.1 + index * 0.1}>
							<div className="mb-10 md:mb-0">
								<h3 className="text-xs">{section.label}</h3>
								<ul className="text-muted-foreground mt-4 space-y-2 text-sm">
									{section.links.map((link) => (
										<li key={link.title}>
											<a
												href={link.href}
												className="hover:text-foreground inline-flex items-center transition-all duration-300"
											>
												{link.icon && <link.icon className="me-1 size-4" />}
												{link.title}
											</a>
										</li>
									))}
								</ul>
							</div>
						</AnimatedContainer>
					))}
				</div>
			</div>
		</footer>
	);
};

type ViewAnimationProps = {
	delay?: number;
	className?: ComponentProps<typeof motion.div>['className'];
	children: ReactNode;
};

function AnimatedContainer({ className, delay = 0.1, children }: ViewAnimationProps) {
	const shouldReduceMotion = useReducedMotion();

	if (shouldReduceMotion) {
		return children;
	}

	return (
		<motion.div
			initial={{ filter: 'blur(4px)', translateY: -8, opacity: 0 }}
			whileInView={{ filter: 'blur(0px)', translateY: 0, opacity: 1 }}
			viewport={{ once: true }}
			transition={{ delay, duration: 0.8 }}
			className={className}
		>
			{children}
		</motion.div>
	);
};

demo.tsx
import { Footer } from '@/components/ui/footer-section';

export default function DemoOne() {
	return (
		<div className="relative flex min-h-svh flex-col">
			<div className="min-h-screen flex items-center justify-center">
				<h1 className='font-mono text-2xl font-bold'>Scrool Down!</h1>
			</div>
			<Footer />
		</div>
	);
}

```

Install NPM dependencies:
```bash
motion, lucide-react
```

---

## Not used: scroll expansion hero

Farnaz considered a picture that grows on scroll (the same component CrisisConnect used for "Be the change"). Dropped: it blocks the page from scrolling until it finishes, which feels frozen, and two scroll takeovers on one homepage is one too many. The homepage keeps a single scroll showpiece, Their words.

