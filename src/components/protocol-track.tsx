import type { Confounder, PowerInfo, ProtocolDesign } from "@/lib/schemas/protocol";

/**
 * Renders an approved ABA design as a phase track: the A/B/A timeline with day
 * counts and washouts, the confounder controls, and the trial-length rationale.
 */
export function ProtocolTrack({
  design,
  powerInfo,
  confounders,
}: {
  design: ProtocolDesign;
  powerInfo: PowerInfo;
  confounders: Confounder[];
}) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Your experiment plan</h2>

      <ol className="mt-4 flex flex-wrap items-stretch gap-2">
        {design.phases.map((phase, i) => (
          <li
            key={i}
            className="flex min-w-24 flex-1 flex-col rounded-lg border p-3 text-center"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {phase.kind === "intervention" ? "Intervention" : "Baseline"}
            </span>
            <span className="text-2xl font-bold">{phase.label}</span>
            <span className="text-sm text-muted-foreground">{phase.days} days</span>
          </li>
        ))}
      </ol>
      {design.washoutDays > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {design.washoutDays}-day washout between phases.
        </p>
      )}

      <p className="mt-4 text-sm">{design.instructions}</p>

      {confounders.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-muted-foreground">Keep these steady</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {confounders.map((c) => (
              <li key={c.name}>{c.control}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">{powerInfo.rationale}</p>
    </section>
  );
}
