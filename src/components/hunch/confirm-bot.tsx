"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import Image from "next/image";

function StarFallback() {
  return (
    <Image
      src="/starburst.png"
      alt=""
      aria-hidden
      width={120}
      height={120}
      className="mx-auto my-[20%] block size-3/5 object-contain opacity-45"
    />
  );
}

const HeroRobot = dynamic(
  () => import("@/components/landing/hero-robot").then((m) => m.HeroRobot),
  { ssr: false, loading: () => <StarFallback /> },
);

/**
 * The confirm-bot in a bounded, centered box. `play` triggers the spin-in
 * intro; until then the robot is hidden, not paused. With reduced motion it
 * never animates at all: the box shows the still starburst instead, since
 * holding `play` false would leave it empty.
 */
export function ConfirmBot({ play, size = 200 }: { play: boolean; size?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="mx-auto" style={{ width: size, height: size }} aria-hidden>
      {reduce ? <StarFallback /> : <HeroRobot play={play} />}
    </div>
  );
}
