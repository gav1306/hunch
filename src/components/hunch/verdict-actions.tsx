"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  RotateCcwIcon,
  SproutIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArchiveHunch } from "@/hooks/use-archive-hunch";
import { useConfirmPanel } from "@/hooks/use-confirm-panel";
import { useRepeatHunch } from "@/hooks/use-repeat-hunch";

/**
 * What to do with an answer.
 *
 * The verdict was the payoff and the end of the road: a paragraph, a chart, and
 * nowhere to go. These are the three things a user actually wants next — the
 * same test again, a different question the result raised, or the whole thing
 * out of the way — plus the record itself, in a file they keep.
 */
export function VerdictActions({
  hunchId,
  statement,
  archived,
}: {
  hunchId: string;
  /** The sharpened hypothesis, so a follow-up starts from what was tested. */
  statement: string;
  /** Whether this hunch is currently filed away, so we offer restore instead of archive. */
  archived: boolean;
}) {
  const router = useRouter();
  const repeat = useRepeatHunch(hunchId);
  const archive = useArchiveHunch(hunchId);
  const confirm = useConfirmPanel();
  const explainerId = useId();

  // The follow-up opens the form on the thing that was just settled, so the
  // user edits a sentence instead of starting from an empty box.
  const followUpSeed = encodeURIComponent(`Follow-up to: ${statement}`);

  const error = repeat.error ?? archive.error;

  return (
    <div className="grid gap-3 border-t border-rule pt-5">
      <p className="m-0 text-xs tracking-[0.16em] text-muted-foreground uppercase">
        What now
      </p>

      <div className="flex flex-wrap gap-2.5">
        <Button
          type="button"
          variant="brand"
          size="touch"
          className="border-rule font-bold"
          disabled={repeat.isPending}
          onClick={() =>
            repeat.mutate(undefined, {
              onSuccess: ({ id }) => router.push(`/hunch/${id}/protocol`),
            })
          }
        >
          <RotateCcwIcon data-icon="inline-start" aria-hidden />
          {repeat.isPending ? "Setting it up…" : "Run it again"}
        </Button>

        <Button
          variant="brand"
          size="touch"
          className="border-rule font-bold"
          render={<Link href={`/hunch/new?seed=${followUpSeed}`} />}
        >
          <SproutIcon data-icon="inline-start" aria-hidden />
          Test a follow-up
        </Button>

        <Button
          variant="brand"
          size="touch"
          className="border-rule font-bold"
          render={<a href={`/api/hunch/${hunchId}/export?format=csv`} download />}
        >
          <DownloadIcon data-icon="inline-start" aria-hidden />
          Export CSV
        </Button>

        <Button
          variant="brand"
          size="touch"
          className="border-rule font-bold"
          render={<a href={`/api/hunch/${hunchId}/export?format=txt`} download />}
        >
          <DownloadIcon data-icon="inline-start" aria-hidden />
          Export text
        </Button>

        {archived ? (
          <Button
            type="button"
            variant="brand"
            size="touch"
            className="border-transparent px-0.5 text-muted-foreground underline underline-offset-4 hover:border-transparent hover:bg-transparent hover:text-ink"
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate(false, {
                onSuccess: () => {
                  router.push("/home");
                  router.refresh();
                },
              })
            }
          >
            <ArchiveRestoreIcon data-icon="inline-start" aria-hidden />
            Restore to home
          </Button>
        ) : (
          !confirm.open && (
            <Button
              type="button"
              variant="brand"
              size="touch"
              className="border-transparent px-0.5 text-muted-foreground underline underline-offset-4 hover:border-transparent hover:bg-transparent hover:text-ink"
              {...confirm.triggerProps}
            >
              <ArchiveIcon data-icon="inline-start" aria-hidden />
              Archive
            </Button>
          )
        )}
      </div>

      {confirm.open && (
        <div
          {...confirm.panelProps}
          aria-labelledby={explainerId}
          className="grid gap-2.5 outline-none"
        >
          <p id={explainerId} className="m-0 text-sm leading-relaxed text-ink">
            Archiving takes this off your home screen. The verdict, the plan and
            every day you logged stay exactly where they are.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button
              type="button"
              variant="brand"
              size="touch"
              className="border-rule font-bold"
              disabled={archive.isPending}
              onClick={() =>
                archive.mutate(true, {
                  onSuccess: () => {
                    router.push("/home");
                    router.refresh();
                  },
                })
              }
            >
              {archive.isPending ? "Archiving…" : "Archive it"}
            </Button>
            <Button
              type="button"
              variant="brand"
              size="touch"
              className="border-rule font-bold"
              disabled={archive.isPending}
              onClick={confirm.dismiss}
            >
              Keep it on home
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="m-0 text-sm text-s1">
          {error.message}
        </p>
      )}
    </div>
  );
}
