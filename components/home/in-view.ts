"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => { const q = window.matchMedia(QUERY); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); };

/** prefers-reduced-motion, read straight from the media query (false on the server). */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}

/** True once the element has been at least `threshold` in view (runs once). Reduced motion: true at once. */
export function useInViewOnce<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  const reduce = usePrefersReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, reduce]);
  return { ref, seen: seen || reduce, reduce };
}
