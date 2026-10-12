import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Hunch stores about you, who processes it, and how to have it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        Hunch is a small personal project: it turns a hunch about yourself into a short
        experiment and reads the result from your own check-ins. This page says what it keeps
        and why. It does not sell, rent or share your data for advertising, and it runs no
        advertising or third-party tracking.
      </p>

      <LegalSection heading="What we store">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-ink">Your account:</strong> name, email address, a hashed
            password if you set one, whether your email is verified, and your two-factor
            settings.
          </li>
          <li>
            <strong className="text-ink">Google sign-in:</strong> if you choose Continue with
            Google, we receive your name, email address and profile picture from Google. We ask
            for nothing else and cannot read your Gmail, Drive or contacts.
          </li>
          <li>
            <strong className="text-ink">Your experiments:</strong> the hunches you write, the
            plans built from them, your daily check-ins and the verdicts.
          </li>
          <li>
            <strong className="text-ink">Sessions:</strong> a sign-in cookie, plus the IP address
            and browser each session started from, kept for security.
          </li>
          <li>
            <strong className="text-ink">Settings:</strong> your reminder hour and time zone.
          </li>
          <li>
            <strong className="text-ink">Limits:</strong> a daily count of AI requests and
            short-lived rate-limit counters, to keep costs and abuse in check.
          </li>
        </ul>
        <p>
          Your browser also keeps an unsent hunch draft and whether you have seen the landing
          intro. These stay on your device.
        </p>
      </LegalSection>

      <LegalSection heading="How it is used">
        <p>
          Only to run the app for you: sign you in, design and run your experiments, send the
          reminders and security emails you asked for, and keep the service up. Nothing is used
          to profile you or train models.
        </p>
      </LegalSection>

      <LegalSection heading="Who processes it">
        <ul className="list-disc space-y-2 pl-5">
          <li>Vercel hosts the app.</li>
          <li>Neon stores the database.</li>
          <li>Inngest runs scheduled jobs such as reminders.</li>
          <li>
            OpenRouter or NVIDIA run the AI models. The text of your hunch and your plan is sent
            to them when the app writes or reviews an experiment; your email address is not.
          </li>
          <li>Gmail or Resend deliver the emails.</li>
          <li>Google handles sign-in if you choose it.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Keeping and deleting it">
        <p>
          Your data stays while your account exists. Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>{" "}
          from the address on your account and your account and everything in it will be
          deleted, or sent to you first if you ask. You can also ask what we hold about you, or
          for a correction.
        </p>
      </LegalSection>

      <LegalSection heading="Not medical advice">
        <p>
          Hunch is a self-experiment tool, not a medical service. Read the{" "}
          <Link href="/terms" className="text-ink underline underline-offset-4">
            terms
          </Link>{" "}
          for what that means.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If this page changes, the date at the top changes with it. Questions go to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
