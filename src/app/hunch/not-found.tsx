import { Boundary, HomeLink } from "@/components/app/boundary";

/**
 * A hunch that isn't there — a mistyped id, someone else's experiment, or one
 * the user deleted from another tab. Everything under `/hunch` is behind the
 * session guard in its layout, so this reader is signed in and `/home` is the
 * right door.
 */
export default function HunchNotFound() {
  return (
    <Boundary
      eyebrow="404"
      title="That experiment is gone."
      body="It may have been deleted, or the link points at a hunch that was never yours."
      action={<HomeLink />}
    />
  );
}
