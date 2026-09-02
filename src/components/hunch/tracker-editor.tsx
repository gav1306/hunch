"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirmPanel } from "@/hooks/use-confirm-panel";
import { useAddTracker, useRetireTracker } from "@/hooks/use-parameter-edits";
import {
  MAX_ACTIVE_PARAMETERS,
  SCALE_MAX,
  SCALE_MIN,
  type Parameter,
  type ParameterType,
} from "@/lib/schemas/parameter";
import { cn } from "@/lib/utils";

const LABEL = "text-xs tracking-[0.16em] text-muted-foreground uppercase";

const KINDS = ["binary", "scale", "count", "amount"] as const;

/** The kinds in the user's words, matching the confirm gate. */
const KIND_LABEL: Record<ParameterType, string> = {
  binary: "yes / no",
  scale: "1-5",
  count: "how many",
  amount: "a number",
};

const KIND_ITEM =
  "min-h-11 border border-rule px-3 font-mono text-xs lowercase aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper";

/** One tracker, with the door out of it. The primary gets no door. */
function TrackerRow({ hunchId, p }: { hunchId: string; p: Parameter }) {
  const retire = useRetireTracker(hunchId);
  const panel = useConfirmPanel();

  if (p.isPrimary) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-rule py-3">
        <span className="text-sm text-ink">{p.label}</span>
        <span className={LABEL}>main measure · runs the whole trial</span>
      </div>
    );
  }

  return (
    <div className="border-b border-rule py-3">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-sm text-ink">{p.label}</span>
        {p.unit && <span className="font-mono text-xs text-muted-foreground">({p.unit})</span>}
        {!panel.open && (
          <Button
            type="button"
            variant="brand"
            size="touch"
            {...panel.triggerProps}
            className="ml-auto border-transparent px-1 font-mono text-xs tracking-[0.08em] text-muted-foreground hover:border-transparent hover:bg-transparent hover:text-ink"
          >
            stop tracking
          </Button>
        )}
      </div>

      {panel.open && (
        <div {...panel.panelProps} className="mt-2.5 grid gap-2.5 outline-none">
          <p className="m-0 text-sm text-muted-foreground">
            Stop tracking {p.label}? The days you&rsquo;ve already logged stay in your results
            and your export. You just won&rsquo;t be asked for it again.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button
              type="button"
              variant="brand"
              size="touch"
              disabled={retire.isPending}
              onClick={() =>
                retire.mutate(
                  { parameterId: p.id, retired: true },
                  { onSuccess: () => panel.dismiss() },
                )
              }
            >
              {retire.isPending ? "Stopping…" : "Stop tracking"}
            </Button>
            <Button type="button" variant="brand" size="touch" onClick={panel.dismiss}>
              Keep it
            </Button>
          </div>
          {retire.isError && (
            <p className="m-0 text-sm text-s1">{retire.error.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** The add form, collapsed until asked for. */
function AddTracker({ hunchId }: { hunchId: string }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ParameterType>("binary");
  const add = useAddTracker(hunchId);

  if (!open) {
    return (
      <Button
        type="button"
        variant="brand"
        size="touch"
        onClick={() => setOpen(true)}
        className="justify-self-start"
      >
        <PlusIcon aria-hidden className="size-(--icon)" />
        Track something else
      </Button>
    );
  }

  return (
    <div className="grid gap-2.5">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="what you'll log"
        aria-label="What to track"
        className="w-full font-mono"
      />
      <ToggleGroup
        value={[type]}
        onValueChange={(v: string[]) => {
          const next = v[v.length - 1] as ParameterType | undefined;
          if (next) setType(next);
        }}
        aria-label="How this is logged"
      >
        {KINDS.map((k) => (
          <ToggleGroupItem key={k} value={k} aria-label={KIND_LABEL[k]} className={KIND_ITEM}>
            {KIND_LABEL[k]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="button"
          variant="brand"
          size="touch"
          disabled={add.isPending}
          onClick={() =>
            add.mutate(
              type === "scale"
                ? { label, type, unit: `${SCALE_MIN}-${SCALE_MAX}`, min: SCALE_MIN, max: SCALE_MAX }
                : { label, type },
              {
                onSuccess: () => {
                  setLabel("");
                  setType("binary");
                  setOpen(false);
                },
              },
            )
          }
        >
          {add.isPending ? "Adding…" : "Start tracking it"}
        </Button>
        <Button type="button" variant="brand" size="touch" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {/* Beside the control that caused it, not a toast that vanishes: these
          errors explain a rule, and the rule is the part worth reading. */}
      {add.isError && <p className="m-0 text-sm text-s1">{add.error.message}</p>}
    </div>
  );
}

/**
 * Adding and retiring trackers mid-trial.
 *
 * The primary is listed but has no control: it is the measure the verdict is
 * computed from, and a trial that stops logging it has no result. The route
 * refuses it too — this only avoids offering something that would be refused.
 *
 * The add control disappears at the cap rather than erroring on submit; being
 * told "no" after typing is worse than not being offered.
 */
export function TrackerEditor({
  hunchId,
  parameters,
}: {
  hunchId: string;
  parameters: Parameter[];
}) {
  const atCap = parameters.length >= MAX_ACTIVE_PARAMETERS;

  return (
    <section
      className={cn(
        "grid gap-2.5 rounded-lg border border-rule bg-card p-[clamp(20px,2.4vw,28px)]",
        "min-w-0 max-w-full",
      )}
    >
      <p className={cn(LABEL, "m-0")}>What you&rsquo;re tracking</p>
      <div className="grid">
        {parameters.map((p) => (
          <TrackerRow key={p.id} hunchId={hunchId} p={p} />
        ))}
      </div>
      {atCap ? (
        <p className="m-0 text-sm text-muted-foreground">
          Five is the most you can track at once. Stop one to make room.
        </p>
      ) : (
        <AddTracker hunchId={hunchId} />
      )}
    </section>
  );
}
