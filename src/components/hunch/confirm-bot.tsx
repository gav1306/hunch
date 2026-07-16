"use client";

import dynamic from "next/dynamic";

function StarFallback() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/starburst.png"
      alt=""
      aria-hidden
      style={{ width: "60%", height: "60%", objectFit: "contain", opacity: 0.45, margin: "20% auto", display: "block" }}
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
    <div style={{ width: size, height: size, margin: "0 auto" }} aria-hidden>
      <HeroRobot play={play} />
    </div>
  );
}
