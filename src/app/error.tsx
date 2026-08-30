"use client";

import { Boundary, HomeLink } from "@/components/app/boundary";
import { Button } from "@/components/ui/button";

/**
 * Any uncaught render or data error inside the app. Next requires this to be a
 * client component and hands it a `reset` that re-renders the segment.
 */
export default function AppError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void _error;
  return (
    <Boundary
      eyebrow="Something broke"
      title="That didn't load."
      body="The error is on our side, not yours. Nothing you logged is affected — try again, or head back home."
      action={
        <>
          <Button
            type="button"
            variant="brand"
            size="touch"
            className="border-rule font-bold"
            onClick={reset}
          >
            Try again
          </Button>
          <HomeLink />
        </>
      }
    />
  );
}
