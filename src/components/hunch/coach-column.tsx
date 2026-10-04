import { ConfirmBot } from "@/components/hunch/confirm-bot";
import { cn } from "@/lib/utils";

export type CoachStep = { label: string; state: "done" | "now" | "later" };

/**
 * The robot and where the Coach has got to, for the left column of the setup
 * screens (new hunch, the plan). Those were one 640px column on a wide screen;
 * this is the handoff's two-column composition, the same as the auth screens.
 * Hidden on phones, where the form comes first and the 3D scene isn't worth
 * loading.
 */
export function CoachColumn({ steps, busy }: { steps: CoachStep[]; busy: boolean }) {
  return (
    <aside className="hidden flex-[1_1_320px] flex-col items-center gap-5 pt-6 md:flex md:max-w-[400px]">
      <div className="flex w-full justify-center bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--s1)_26%,transparent),color-mix(in_srgb,var(--s2)_10%,transparent)_60%,transparent)] py-6">
        <ConfirmBot play size={220} />
      </div>
      <p className="m-0 text-xs tracking-[0.16em] text-muted-foreground uppercase">
        <span aria-hidden className="mr-2 text-s1">
          ✦
        </span>
        {busy ? "The coach is on it" : "The coach"}
      </p>
      <ol className="m-0 grid list-none gap-2.5 p-0 text-sm">
        {steps.map((c) => (
          <li
            key={c.label}
            className={cn(
              "flex items-baseline gap-2.5",
              c.state === "later" ? "text-muted-foreground" : "text-ink",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "w-3 text-center",
                c.state === "done" && "text-good",
                c.state === "now" && "text-s1",
              )}
            >
              {c.state === "done" ? "✓" : c.state === "now" ? "●" : "○"}
            </span>
            {c.label}
            <span className="sr-only">
              {c.state === "done" ? " (done)" : c.state === "now" ? " (now)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
