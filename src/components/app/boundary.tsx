import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The screen the app shows when there is nothing else to show.
 *
 * A mistyped URL used to drop the user out of a black app onto Next's default
 * white page — no header, no type, no way back. This is the same ground and the
 * same voice as everything else, and it always offers a door.
 */
export function Boundary({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  /** The way out. A retry button on an error, a link home on a 404. */
  action: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[620px] flex-col justify-center px-[clamp(20px,5vw,40px)] py-16">
      <p className="m-0 text-xs tracking-[0.24em] text-muted-foreground uppercase">
        <span aria-hidden className="text-s1">
          ✦
        </span>{" "}
        {eyebrow}
      </p>
      <h1 className="mt-4 mb-0 font-heading text-[clamp(30px,4.4vw,48px)] font-bold tracking-[-0.02em] text-ink">
        {title}
      </h1>
      <p className="mt-4 mb-8 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="flex flex-wrap gap-2.5">{action}</div>
    </main>
  );
}

/** The link every boundary offers, so no screen is a dead end. */
export function HomeLink({ children = "Back to home" }: { children?: React.ReactNode }) {
  return (
    <Button
      variant="brand"
      size="touch"
      className="border-rule font-bold"
      render={<Link href="/home" />}
    >
      {children}
    </Button>
  );
}
