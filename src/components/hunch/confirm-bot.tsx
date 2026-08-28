"use client";

import dynamic from "next/dynamic";
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

/** The confirm-bot in a bounded, centered box. `play` triggers the spin-in intro. */
export function ConfirmBot({ play, size = 200 }: { play: boolean; size?: number }) {
  return (
    <div className="mx-auto" style={{ width: size, height: size }} aria-hidden>
      <HeroRobot play={play} />
    </div>
  );
}
