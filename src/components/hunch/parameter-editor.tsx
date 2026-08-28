"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import type { ParameterDraft } from "@/lib/schemas/parameter";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const mono = "'Space Mono',monospace";

const field: React.CSSProperties = {
  padding: "9px 11px",
  background: "color-mix(in srgb,var(--paper) 82%,var(--ink))",
  border: "1px solid var(--rule)",
  borderRadius: 9,
  color: "var(--ink)",
  fontFamily: mono,
  fontSize: 12.5,
  minWidth: 0,
};

const ghostBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: mono,
  fontSize: 11.5,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted)",
  padding: 0,
};

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
      style={{
        border: "1px solid var(--rule)",
        borderLeft: row.isPrimary ? "2px solid var(--s1)" : "1px solid var(--rule)",
        borderRadius: 11,
        padding: "12px 13px",
        display: "grid",
        gap: 9,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...label, color: row.isPrimary ? "var(--s1)" : "var(--muted)" }}>
          {row.isPrimary ? "main measure" : "also tracking"}
        </span>
        {onRemove && (
          <button type="button" onClick={onRemove} style={{ ...ghostBtn, marginLeft: "auto" }}>
            remove
          </button>
        )}
      </div>

      <input
        value={row.label}
        onChange={(e) => onChange({ ...row, label: e.target.value })}
        placeholder="what you'll log"
        aria-label={row.isPrimary ? "Main measure" : "Tracker"}
        style={{ ...field, width: "100%" }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() =>
            onChange(
              row.type === "binary"
                ? { ...row, type: "continuous" }
                : { ...row, type: "binary", unit: undefined, min: undefined, max: undefined },
            )
          }
          style={{
            ...field,
            cursor: "pointer",
            borderColor: "var(--rule)",
            background: "transparent",
          }}
        >
          {row.type === "binary" ? "yes / no" : "a number"}
        </button>

        {row.type === "continuous" && (
          <>
            <input
              value={row.unit ?? ""}
              onChange={(e) => onChange({ ...row, unit: e.target.value || undefined })}
              placeholder="unit"
              aria-label="Unit"
              style={{ ...field, width: 88 }}
            />
            <input
              type="number"
              step="any"
              value={row.min ?? ""}
              onChange={(e) =>
                onChange({ ...row, min: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              placeholder="min"
              aria-label="Lowest value"
              style={{ ...field, width: 76 }}
            />
            <input
              type="number"
              step="any"
              value={row.max ?? ""}
              onChange={(e) =>
                onChange({ ...row, max: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              placeholder="max"
              aria-label="Highest value"
              style={{ ...field, width: 76 }}
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
    <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
      {primaryIndex >= 0 && (
        <Row
          row={value[primaryIndex]}
          onChange={(next) => replaceAt(primaryIndex, next)}
          onRemove={null}
        />
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...ghostBtn, justifySelf: "start", color: "var(--s1)" }}
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
      </button>

      {open && (
        <div style={{ display: "grid", gap: 10 }}>
          {trackers.length === 0 && (
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--muted)" }}>
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
            <button
              type="button"
              onClick={() =>
                onChange([...value, { label: "", type: "continuous", isPrimary: false }])
              }
              style={{ ...ghostBtn, justifySelf: "start" }}
            >
              <PlusIcon aria-hidden className="mr-1.5 inline-block size-(--icon) align-[-0.15em]" />
              add another
            </button>
          )}
        </div>
      )}
    </div>
  );
}
