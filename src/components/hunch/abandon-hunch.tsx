"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { useConfirmPanel } from "@/hooks/use-confirm-panel";
import { useDeleteHunch } from "@/hooks/use-delete-hunch";
import { Button } from "@/components/ui/button";

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
  const confirm = useConfirmPanel();
  const explainerId = useId();

  if (!confirm.open) {
    return (
      <Button
        type="button"
        variant="brand"
        size="touch"
        {...confirm.triggerProps}
        className="border-transparent px-0.5 text-muted-foreground underline underline-offset-4 hover:border-transparent hover:bg-transparent hover:text-ink"
      >
        Abandon this hunch
      </Button>
    );
  }

  return (
    <div
      {...confirm.panelProps}
      aria-labelledby={explainerId}
      className="grid gap-2.5 pt-3 outline-none"
    >
      <p id={explainerId} className="m-0 text-sm leading-relaxed text-ink">
        {loggedDays > 0
          ? `This deletes the hunch and the ${loggedDays} ${loggedDays === 1 ? "day" : "days"} you've logged against it. It can't be undone.`
          : "This deletes the hunch and its plan. It can't be undone."}
      </p>
      {remove.isError && (
        <p role="alert" className="m-0 text-sm text-s1">
          {remove.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="button"
          variant="brand"
          size="touch"
          disabled={remove.isPending}
          onClick={() => remove.mutate(undefined, { onSuccess: () => router.push("/home") })}
          className="border-s1 bg-s1 font-bold text-paper hover:bg-s1"
        >
          {remove.isPending ? "Deleting…" : "Yes, delete it"}
        </Button>
        <Button
          type="button"
          variant="brand"
          size="touch"
          disabled={remove.isPending}
          onClick={confirm.dismiss}
          className="border-rule font-bold"
        >
          Keep it
        </Button>
      </div>
    </div>
  );
}
