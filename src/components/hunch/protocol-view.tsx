"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProtocolStepper } from "@/components/protocol-stepper";
import { ObservationalPlan } from "@/components/observational-plan";
import { AbandonHunch } from "@/components/hunch/abandon-hunch";
import { GHOST, ParameterEditor } from "@/components/hunch/parameter-editor";
import { useDesignProtocol } from "@/hooks/use-design-protocol";
import { useHunchInfo } from "@/hooks/use-hunch-info";
import { draftsFromSharpened } from "@/lib/parameters";
import { parameterListSchema, type ParameterDraft } from "@/lib/schemas/parameter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useObserveOnly } from "@/hooks/use-observe-only";

const LABEL = "text-xs tracking-[0.16em] text-muted-foreground uppercase";

/**
 * What the design step is about to produce, in the shape it will arrive in.
 *
 * It used to be one centred line of text for a wait that runs ten to twenty
 * seconds, so the page looked stalled rather than busy and the layout jumped
 * when the plan landed. This is the stepper's own frame — hypothesis card,
 * timeline, phase card — held empty.
 */
function DesignSkeleton() {
  return (
    <div className="grid gap-5" aria-hidden>
      <div className="rounded-lg border border-rule border-l-2 border-l-s1 bg-card p-[clamp(16px,2vw,20px)]">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-6 w-full" />
        <Skeleton className="mt-2 h-6 w-3/5" />
      </div>
      <div className="flex items-center px-0.5">
        <Skeleton className="size-11 flex-none rounded-full" />
        <Skeleton className="h-px flex-auto rounded-none" />
        <Skeleton className="size-11 flex-none rounded-full" />
        <Skeleton className="h-px flex-auto rounded-none" />
        <Skeleton className="size-11 flex-none rounded-full" />
      </div>
      <div className="rounded-xl border border-rule bg-card p-[clamp(18px,2.2vw,24px)]">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-[26px]" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
        <Skeleton className="mt-4 h-7 w-2/3" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-4/5" />
      </div>
    </div>
  );
}

/**
 * Phase 3 UI — Variation B: confirm the sharpened hypothesis, then design the
 * protocol and step through it, all on one page. The design does NOT auto-run;
 * the user approves first (or redoes). Approved → the phase stepper; refused →
 * the "talk to a doctor" panel. Hunch is NOT medical advice. Shell-less authed
 * page — spreads appThemeStyle() onto its own root.
 */
export function ProtocolView({ id }: { id: string }) {
  const info = useHunchInfo(id);
  const design = useDesignProtocol(id);
  const observe = useObserveOnly(id);
  const router = useRouter();

  // What the read gives us: the persisted parameters if the sharpen step wrote
  // them, otherwise just the outcome as the primary. Derived, not stored — the
  // user's edits take over the moment they touch the list.
  const seeded = useMemo<ParameterDraft[] | null>(() => {
    if (!info.data) return null;
    const stored = info.data.parameters;
    return stored.length > 0
      ? stored.map((p) => ({
          label: p.label,
          type: p.type,
          unit: p.unit,
          min: p.min,
          max: p.max,
          isPrimary: p.isPrimary,
          isExposure: p.isExposure,
        }))
      : draftsFromSharpened({
          outcomeMetric: info.data.hypothesis.outcomeMetric,
          outcomeType: info.data.hypothesis.outcomeType,
        });
  }, [info.data]);

  const [edited, setEdited] = useState<ParameterDraft[] | null>(null);
  const drafts = edited ?? seeded;

  // The Coach's guess at whether this change can be scheduled — and the
  // user's override of it. Mirrors `edited ?? seeded`: null means "hasn't
  // touched the line yet," and the server's answer stands until they do.
  const [schedulable, setSchedulable] = useState<boolean | null>(null);
  const isSchedulable = schedulable ?? info.data?.hypothesis.schedulable ?? true;

  /**
   * The user overruling the Coach's shape guess. Flipping to observational
   * adds the daily yes/no the arms will be derived from, empty and focused,
   * so the user names it; flipping back to schedulable drops that row
   * entirely — it has no place in a trial the calendar already splits.
   */
  function changeShape(nextSchedulable: boolean) {
    setSchedulable(nextSchedulable);
    const base = drafts ?? [];
    setEdited(
      nextSchedulable
        ? base.filter((d) => !d.isExposure)
        : base.some((d) => d.isExposure)
          ? base
          : [...base, { label: "", type: "binary", isPrimary: false, isExposure: true }],
    );
  }

  const cleaned = (drafts ?? []).filter((d) => d.label.trim() !== "");
  const exposureRow = (drafts ?? []).find((d) => d.isExposure) ?? null;
  // The one reason the confirm gate currently blocks with an explanation
  // rather than just going inert — an observational trial with nothing to
  // tell its days apart is a plan the server will refuse anyway.
  const missingExposure = !isSchedulable && (!exposureRow || exposureRow.label.trim() === "");
  const canDesign = !missingExposure && parameterListSchema.safeParse(cleaned).success;

  // Prefer a freshly-designed result; fall back to an already-stored protocol.
  const protocol = design.data?.protocol ?? info.data?.protocol ?? null;
  const hypothesis = design.data?.hypothesis ?? info.data?.hypothesis ?? null;
  const refusalReason = design.data?.safety.reason; // only present on a fresh design
  const refused = protocol?.safetyState === "refused";
  const approved = !!protocol && !refused;
  const atConfirmGate = !!hypothesis && !approved && !refused && !design.isPending;

  // A client-side navigation leaves the reading cursor at the top of the
  // document, so a screen reader lands on this page silent: the statement the
  // user just watched stream in on the form is never spoken. Moving focus to
  // the heading that holds it speaks it, and parks the cursor on the gate's
  // own controls rather than on page chrome.
  //
  // Focus, not a live region, because the form tried a live region and lost
  // the race — `router.push` unmounts it before a polite announcement is read.
  //
  // Once only. Refusing and coming back, or a `useHunchInfo` refetch, must not
  // yank focus out from under someone already working the gate.
  const gateHeading = useRef<HTMLHeadingElement>(null);
  const announcedGate = useRef(false);
  useEffect(() => {
    if (announcedGate.current || !gateHeading.current) return;
    announcedGate.current = true;
    gateHeading.current.focus();
  }, [atConfirmGate]);

  return (
    <div>
      {info.isPending && (
        <p aria-live="polite" className="text-xs tracking-[0.04em] text-muted-foreground">
          Loading…
        </p>
      )}

      {info.isError && (
        <p role="alert" className="text-sm text-s1 [overflow-wrap:anywhere]">
          {info.error.message}
        </p>
      )}

      {/* Confirm gate — no protocol yet, hypothesis in hand, not mid-design */}
      {atConfirmGate && hypothesis && (
        <div>
          <div className="min-w-0 rounded-lg border border-rule border-l-2 border-l-s1 bg-card p-[clamp(16px,2vw,20px)]">
            <p className={cn(LABEL, "m-0")}>What you&apos;re testing</p>
            {/* tabIndex/outline-none: focusable so the statement can be spoken on
                arrival, with no stray ring for a mouse user. */}
            <h2
              ref={gateHeading}
              tabIndex={-1}
              className="mt-2 mb-0 font-heading text-[clamp(17px,2.4vw,22px)] leading-snug font-semibold tracking-[-0.01em] text-ink outline-none [overflow-wrap:anywhere]"
            >
              {hypothesis.statement}
            </h2>
            <p className="mt-2.5 mb-0 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
              You&apos;ll log this daily — edit anything that&apos;s off.
            </p>
          </div>

          {/* The Coach's guess at whether this can run on a schedule — the
              user knows their own week better than the model does, so it's
              never final. */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-rule bg-card px-3 py-3">
            <p className="m-0 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
              {isSchedulable
                ? "We'll ask you to do it on a schedule — some days on, some days off."
                : "We'll watch the days you do it, rather than ask you to do it on a schedule."}
            </p>
            <Button
              type="button"
              variant="brand"
              size="touch"
              onClick={() => changeShape(!isSchedulable)}
              className={cn(GHOST, "shrink-0")}
            >
              change
            </Button>
          </div>

          {drafts && (
            <ParameterEditor value={drafts} schedulable={isSchedulable} onChange={setEdited} />
          )}

          {missingExposure && (
            <p role="alert" className="mt-2.5 mb-0 text-xs leading-relaxed text-s1 [overflow-wrap:anywhere]">
              Name the one yes/no we&apos;ll ask each day.
            </p>
          )}

          <div className="mt-4 flex gap-2.5">
            {/* Re-sharpens this hunch, pre-filled with the words it started
                as. This used to link to a blank /hunch/new, which discarded
                the raw text and the clarifying answers and left the old
                hunch stranded in "Finish setting up" with no way to remove it. */}
            <Button
              variant="brand"
              size="touch"
              className="flex-1 border-ink font-bold"
              render={<Link href={`/hunch/new?resume=${id}`} />}
            >
              <RotateCcwIcon data-icon="inline-start" aria-hidden />
              redo
            </Button>
            <Button
              type="button"
              disabled={!canDesign}
              variant="brand"
              size="touch"
              onClick={() => design.mutate({ parameters: cleaned, schedulable: isSchedulable })}
              className={cn(
                "flex-1 border-s1 font-bold",
                canDesign ? "bg-s1 text-paper hover:bg-s1" : "text-muted-foreground",
              )}
            >
              Looks right — design it
              <ArrowRightIcon data-icon="inline-end" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {design.isPending && (
        <div className="grid gap-5">
          {/* The wait runs ten to twenty seconds. Saying so is the difference
              between a page that is working and a page that is broken. */}
          <p aria-live="polite" className={cn(LABEL, "m-0 font-mono")}>
            Designing your experiment — about ten seconds…
          </p>
          <DesignSkeleton />
        </div>
      )}

      {design.isError && (
        <div role="alert" className="mt-5 rounded-lg border border-rule bg-card px-[18px] py-4">
          <div className="flex items-baseline gap-2.5">
            <span aria-hidden className="text-s1">
              ✦
            </span>
            <p className="m-0 font-heading text-base font-semibold text-ink">
              Couldn&apos;t design this one
            </p>
          </div>
          <p className="mt-2 mb-0 ml-5 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
            {design.error.message}
          </p>
          <Button
            type="button"
            variant="brand"
            size="touch"
            onClick={() => design.mutate({ parameters: cleaned, schedulable: isSchedulable })}
            className="mt-2 ml-[14px] border-transparent text-s1 hover:border-transparent hover:bg-transparent hover:text-s1"
          >
            <RotateCcwIcon data-icon="inline-start" aria-hidden />
            try again
          </Button>
        </div>
      )}

      {approved && hypothesis && protocol && !design.isPending && (
        protocol.design.shape === "observational" ? (
          <ObservationalPlan
            hunchId={id}
            hypothesis={hypothesis}
            design={protocol.design}
            exposureLabel={exposureRow?.label.trim() || null}
          />
        ) : (
          <ProtocolStepper
            hunchId={id}
            hypothesis={hypothesis}
            design={protocol.design}
            powerInfo={protocol.powerInfo}
            confounders={protocol.confounders}
          />
        )
      )}

      {refused && !design.isPending && (
        <section className="rounded-xl border border-s1 bg-card p-[clamp(20px,2.4vw,28px)]">
          <h2 className="m-0 font-heading text-[clamp(18px,2.2vw,22px)] font-semibold tracking-[-0.01em] text-ink">
            Let&apos;s not run this one on your own
          </h2>
          {refusalReason && (
            <p className="mt-3 mb-0 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
              {refusalReason}
            </p>
          )}
          <p className={cn(LABEL, "mt-4 mb-0")}>
            Hunch is not medical advice — please talk to a doctor before trying this.
          </p>

          {/* Until now this card was the app's only dead end. The hunch behind
              it is still a real thing the person noticed; what it can't do is
              schedule the change. So it keeps the record instead. */}
          <p className="mt-4 mb-0 text-sm leading-relaxed text-ink">
            What it can still do is keep the record — change nothing, log each day, and
            you&rsquo;ll have your own account of it.
          </p>
          <div className="mt-4">
            <Button
              type="button"
              variant="brand"
              size="touch"
              disabled={observe.isPending}
              onClick={() => observe.mutate(undefined, { onSuccess: () => router.refresh() })}
            >
              {observe.isPending ? "Setting it up…" : "Track it as it is"}
            </Button>
          </div>
          {observe.isError && (
            <p className="mt-2.5 mb-0 text-sm text-s1">{observe.error.message}</p>
          )}
        </section>
      )}

      {/* Reachable here too: home's setup cards point at this page, so a
          hunch the user gave up on mid-setup would otherwise have no exit. */}
      <div className="mt-10 border-t border-rule pt-2">
        <AbandonHunch hunchId={id} />
      </div>
    </div>
  );
}
