"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import type { ParameterDraft } from "@/lib/schemas/parameter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const LABEL = "text-xs tracking-[0.16em] uppercase";

/**
 * The ghost controls in this editor were 11.5px text with no padding — under
 * 20px of tappable height on a screen the audit found four of them on. They are
 * buttons at the 44px touch size now, drawn borderless so the row still reads
 * as quiet.
 */
const GHOST =
  "justify-self-start border-transparent px-1 font-mono text-xs tracking-[0.08em] text-muted-foreground hover:border-transparent hover:bg-transparent hover:text-ink";

/** One editable row: label, number/yes-no toggle, and (for numbers) unit + bounds. */
function Row({
  row,
  onChange,
  onRemove,
}: {
  row: ParameterDraft;
  onChange: (next: ParameterDraft) => void;
  onRemove: (() => void) | null;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-2.5 rounded-lg border border-rule px-3 py-3",
        row.isPrimary && "border-l-2 border-l-s1",
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={cn(LABEL, row.isPrimary ? "text-s1" : "text-muted-foreground")}>
          {row.isPrimary ? "main measure" : "also tracking"}
        </span>
        {onRemove && (
          <Button
            type="button"
            variant="brand"
            size="touch"
            onClick={onRemove}
            className={cn(GHOST, "ml-auto")}
          >
            remove
          </Button>
        )}
      </div>

      <Input
        value={row.label}
        onChange={(e) => onChange({ ...row, label: e.target.value })}
        placeholder="what you'll log"
        aria-label={row.isPrimary ? "Main measure" : "Tracker"}
        className="w-full font-mono"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="brand"
          size="touch"
          onClick={() =>
            onChange(
              row.type === "binary"
                ? { ...row, type: "amount" }
                : { ...row, type: "binary", unit: undefined, min: undefined, max: undefined },
            )
          }
          className="border-rule font-mono lowercase"
        >
          {row.type === "binary" ? "yes / no" : "a number"}
        </Button>

        {row.type === "amount" && (
          <>
            <Input
              value={row.unit ?? ""}
              onChange={(e) => onChange({ ...row, unit: e.target.value || undefined })}
              placeholder="unit"
              aria-label="Unit"
              className="w-24 font-mono"
            />
            <Input
              type="number"
              step="any"
              value={row.min ?? ""}
              onChange={(e) =>
                onChange({ ...row, min: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              placeholder="min"
              aria-label="Lowest value"
              className="w-20 font-mono"
            />
            <Input
              type="number"
              step="any"
              value={row.max ?? ""}
              onChange={(e) =>
                onChange({ ...row, max: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              placeholder="max"
              aria-label="Highest value"
              className="w-20 font-mono"
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The confirm gate's parameter list: the primary measure (always shown, never
 * removable) plus the trackers the Coach proposed, all editable. Trackers live
 * behind a disclosure so the default view stays about the hypothesis.
 */
export function ParameterEditor({
  value,
  onChange,
}: {
  value: ParameterDraft[];
  onChange: (next: ParameterDraft[]) => void;
}) {
  const primaryIndex = value.findIndex((p) => p.isPrimary);
  const trackers = value.filter((p) => !p.isPrimary);
  const [open, setOpen] = useState(trackers.length > 0);

  const replaceAt = (i: number, next: ParameterDraft) =>
    onChange(value.map((row, j) => (j === i ? next : row)));

  return (
    <div className="mt-4 grid gap-2.5">
      {primaryIndex >= 0 && (
        <Row
          row={value[primaryIndex]}
          onChange={(next) => replaceAt(primaryIndex, next)}
          onRemove={null}
        />
      )}

      <Button
        type="button"
        variant="brand"
        size="touch"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(GHOST, "text-s1 hover:text-s1")}
      >
        {open ? (
          <>
            <MinusIcon aria-hidden className="mr-1.5 inline-block size-(--icon) align-[-0.15em]" />
            things to track
          </>
        ) : (
          <>
            <PlusIcon aria-hidden className="mr-1.5 inline-block size-(--icon) align-[-0.15em]" />
            things to track{trackers.length ? ` (${trackers.length})` : ""}
          </>
        )}
      </Button>

      {open && (
        <div className="grid gap-2.5">
          {trackers.length === 0 && (
            <p className="m-0 text-xs leading-relaxed text-muted-foreground">
              Add anything else you want to log next to it — it won&apos;t change the verdict, it
              just helps you read the result.
            </p>
          )}

          {value.map((row, i) =>
            row.isPrimary ? null : (
              <Row
                key={i}
                row={row}
                onChange={(next) => replaceAt(i, next)}
                onRemove={() => onChange(value.filter((_, j) => j !== i))}
              />
            ),
          )}

          {value.length < 5 && (
            <Button
              type="button"
              variant="brand"
              size="touch"
              onClick={() =>
                onChange([...value, { label: "", type: "amount", isPrimary: false }])
              }
              className={GHOST}
            >
              <PlusIcon aria-hidden className="mr-1.5 inline-block size-(--icon) align-[-0.15em]" />
              add another
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
