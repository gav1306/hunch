"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fires once when the element scrolls into view. Returns a ref to attach and a
 * boolean that flips true on first intersection. Honors prefers-reduced-motion
 * by reporting visible immediately (no transition to animate from).
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options?: { threshold?: number; rootMargin?: string },
) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(t);
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      {
        threshold: options?.threshold ?? 0.2,
        rootMargin: options?.rootMargin ?? "0px 0px -12% 0px",
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [options?.threshold, options?.rootMargin]);

  return { ref, shown };
}
