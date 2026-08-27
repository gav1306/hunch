"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDeleteHunch } from "@/hooks/use-delete-hunch";

const label: React.CSSProperties = {
  fontFamily: "'Space Mono',monospace",
  fontSize: 11.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

/**
 * Give up on a hunch and remove it.
 *
 * There was no delete anywhere in the app, so a hunch the user abandoned
 * mid-setup stayed in "Finish setting up" permanently and a concluded one stayed
 * on home forever. Deliberately quiet — this is an escape hatch, not an action
 * to invite — and it asks once before doing anything, because everything logged
 * against the hunch goes with it.
 */
export function AbandonHunch({
  hunchId,
  /** What disappears, so the confirm names the cost. */
  loggedDays = 0,
}: {
  hunchId: string;
  loggedDays?: number;
}) {
  const router = useRouter();
  const remove = useDeleteHunch(hunchId);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        style={{
          ...label,
          background: "none",
          border: "none",
          padding: "12px 2px",
          color: "var(--muted)",
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 4,
        }}
      >
        Abandon this hunch
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10, paddingTop: 12 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink)" }}>
        {loggedDays > 0
          ? `This deletes the hunch and the ${loggedDays} ${loggedDays === 1 ? "day" : "days"} you've logged against it. It can't be undone.`
          : "This deletes the hunch and its plan. It can't be undone."}
      </p>
      {remove.isError && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--s1)" }}>
          {remove.error.message}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => remove.mutate(undefined, { onSuccess: () => router.push("/home") })}
          style={{
            ...label,
            fontWeight: 700,
            padding: "12px 18px",
            borderRadius: 11,
            border: "1px solid var(--s1)",
            background: "var(--s1)",
            color: "var(--paper)",
            cursor: remove.isPending ? "wait" : "pointer",
            opacity: remove.isPending ? 0.6 : 1,
          }}
        >
          {remove.isPending ? "Deleting…" : "Yes, delete it"}
        </button>
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => setConfirming(false)}
          style={{
            ...label,
            fontWeight: 700,
            padding: "12px 18px",
            borderRadius: 11,
            border: "1px solid var(--rule)",
            background: "transparent",
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
