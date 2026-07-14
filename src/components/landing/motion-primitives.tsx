"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";

const EASE = [0.16, 0.9, 0.24, 1] as const;

/**
 * Slide + scale + fade as the element scrolls into view. Fires once.
 * Falls back to a plain container under prefers-reduced-motion.
 */
export function Reveal({
  children,
  y = 56,
  delay = 0,
  duration = 0.9,
  className,
  style,
  as = "div",
}: {
  children: ReactNode;
  y?: number;
  delay?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "section" | "li" | "span" | "h2" | "h3";
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as];

  if (reduce) {
    const Tag = as;
    return (
      <Tag className={className} style={style}>
        {children}
      </Tag>
    );
  }

  return (
    <MotionTag
      className={className}
      style={style}
      initial={{ opacity: 0, y, scale: 0.965 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: false, margin: "0px 0px -12% 0px" }}
      transition={{ duration, ease: EASE, delay }}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Scroll-linked vertical parallax. `speed` is the peak offset in px applied
 * across the element's travel through the viewport (positive = drifts up).
 */
export function Parallax({
  children,
  speed = 60,
  className,
  style,
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [speed, -speed]);

  if (reduce) {
    return (
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} className={className} style={{ ...style, y }}>
      {children}
    </motion.div>
  );
}
