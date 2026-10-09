import { HunchLanding } from "@/components/landing/hunch-landing";
import { introGateCss, introGateScript } from "@/components/landing/intro-gate";

export default function Home() {
  return (
    <>
      {/* Runs while the HTML is parsed, before the hero paints: decides whether
          the intro hides the hero copy. See intro-gate.ts. */}
      <script dangerouslySetInnerHTML={{ __html: introGateScript }} />
      <style>{introGateCss}</style>
      <HunchLanding />
    </>
  );
}
