import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Hunch, including that it is not medical advice.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>
        By creating an account or using Hunch you agree to these terms. If you do not agree,
        please do not use it.
      </p>

      <LegalSection heading="What Hunch is">
        <p>
          Hunch helps you test a hunch about your own habits with a short, structured
          experiment and a statistical read of your check-ins. It is a personal project offered
          free of charge, as is.
        </p>
      </LegalSection>

      <LegalSection heading="Not medical advice">
        <p>
          Nothing in Hunch is medical, psychological or nutritional advice, and a verdict is
          not a diagnosis. Do not use it to start, stop or change a medication or treatment, to
          fast in a way that could harm you, or in place of a professional. Talk to a doctor
          before any change to your health routine, and stop an experiment straight away if it
          makes you unwell.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          You must be at least 18. Keep your sign-in details to yourself; you are responsible
          for what happens under your account. Give a real email address so you can recover
          it.
        </p>
      </LegalSection>

      <LegalSection heading="Fair use">
        <p>
          Do not misuse the service: no attempts to break in, overload it, get around its
          limits, or use the AI features for anything unlawful or unrelated to your own
          experiments. Accounts that do may be suspended or deleted.
        </p>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          What you write stays yours. You let Hunch store and process it only to run the
          service for you, as the{" "}
          <Link href="/privacy" className="text-ink underline underline-offset-4">
            privacy page
          </Link>{" "}
          describes.
        </p>
      </LegalSection>

      <LegalSection heading="No guarantees">
        <p>
          The AI can be wrong and the statistics only describe your own data. The service may
          change, pause or stop, and data could be lost. To the extent the law allows, Hunch is
          provided without warranties and its author is not liable for any loss arising from
          using it.
        </p>
      </LegalSection>

      <LegalSection heading="Ending it">
        <p>
          You can stop at any time and ask for your account to be deleted by emailing{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>
          . These terms may change; the date at the top shows the last change, and using Hunch
          after it means you accept the new version.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
