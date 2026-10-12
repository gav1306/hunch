import Link from "next/link";

/**
 * Where to write about your data or these terms. It is the support address on
 * the Google sign-in consent screen too, so the two never disagree.
 */
export const CONTACT_EMAIL = "gavk30@gmail.com";

/** The date both documents last changed. Bump it with any edit to either. */
export const LEGAL_UPDATED = "12 October 2026";

/**
 * The frame for the privacy policy and the terms: public, read signed out, so
 * the door goes to the landing page. Same ground and voice as the 404, but a
 * reading column wide enough for running text.
 */
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[720px] px-[clamp(20px,5vw,40px)] py-16">
      <Link
        href="/"
        className="text-xs tracking-[0.24em] text-muted-foreground uppercase hover:text-ink"
      >
        <span aria-hidden className="text-s1">
          ✦
        </span>{" "}
        hunch
      </Link>
      <h1 className="mt-6 mb-0 font-heading text-[clamp(30px,4.4vw,48px)] font-bold tracking-[-0.02em] text-ink">
        {title}
      </h1>
      <p className="mt-3 mb-10 text-xs text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">{children}</div>
      <p className="mt-12 border-t border-rule pt-6 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" className="hover:text-ink">
          Terms
        </Link>
        {" · "}
        <Link href="/" className="hover:text-ink">
          Back to hunch
        </Link>
      </p>
    </main>
  );
}

/** One titled part of a legal page. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="m-0 font-heading text-lg font-semibold text-ink">{heading}</h2>
      {children}
    </section>
  );
}
