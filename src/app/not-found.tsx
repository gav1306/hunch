import { Boundary, HomeLink } from "@/components/app/boundary";

export default function NotFound() {
  return (
    <Boundary
      eyebrow="404"
      title="Nothing here."
      body="This page doesn't exist — or the experiment it pointed at has been deleted."
      action={<HomeLink />}
    />
  );
}
