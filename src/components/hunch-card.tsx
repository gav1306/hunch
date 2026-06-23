import type { HunchWithHypothesis } from "@/hooks/use-create-hunch";

/**
 * Renders a sharpened hunch: the original text plus the falsifiable
 * hypothesis the Coach produced.
 */
export function HunchCard({ hunch }: { hunch: HunchWithHypothesis }) {
  const { hypothesis } = hunch;

  return (
    <article className="rounded-xl border bg-card p-6 shadow-sm">
      <p className="text-sm text-muted-foreground italic">
        &ldquo;{hunch.rawText}&rdquo;
      </p>

      <h2 className="mt-4 text-lg font-semibold leading-snug">
        {hypothesis.statement}
      </h2>

      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="font-medium text-muted-foreground">Outcome metric</dt>
          <dd>{hypothesis.outcomeMetric}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">Outcome type</dt>
          <dd>
            <span className="inline-flex rounded-full border px-2 py-0.5 text-xs capitalize">
              {hypothesis.outcomeType}
            </span>
          </dd>
        </div>
        {hypothesis.confounders.length > 0 && (
          <div>
            <dt className="font-medium text-muted-foreground">
              Watch for confounders
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {hypothesis.confounders.map((c) => (
                <span
                  key={c}
                  className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {c}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}
