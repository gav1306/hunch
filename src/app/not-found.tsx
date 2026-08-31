import { Boundary, HomeLink } from "@/components/app/boundary";

/**
 * The public 404 — anything that matched no route at all. The reader may never
 * have signed in, so the door goes to the landing page rather than to `/home`.
 * Missing hunches get the signed-in version in `app/hunch/not-found.tsx`.
 */
export default function NotFound() {
  return (
    <Boundary
      eyebrow="404"
      title="Nothing here."
      body="This page doesn't exist — or the experiment it pointed at has been deleted."
      action={<HomeLink href="/">Back to hunch</HomeLink>}
    />
  );
}
