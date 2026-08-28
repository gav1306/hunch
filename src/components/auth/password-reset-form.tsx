"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthGaze } from "@/components/auth/auth-gaze";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

/** Uppercase mono, at the 12px readable floor rather than the old 10.5px. */
const LABEL_CLASS = "text-xs uppercase tracking-[0.16em] text-muted-foreground";

/** The full-width filled submit these three forms share. */
const SUBMIT_CLASS =
  "auth-submit mt-[18px] w-full border-none bg-ink py-4 text-[13px] tracking-[0.14em] text-paper";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>
      <span style={{ color: "var(--s1)" }}>✦</span> {children}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h1 style={{ margin: "0 0 10px", fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(28px,3.6vw,40px)", lineHeight: 1.04, letterSpacing: "-0.02em" }}>
      {children}
    </h1>
  );
}

function Blurb({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 28px", fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>{children}</p>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{ margin: "6px 0 4px", fontSize: 12, lineHeight: 1.5, color: "var(--s1)" }}>
      {children}
    </div>
  );
}

/**
 * Ask for a reset link.
 *
 * The confirmation is deliberately the same whether or not the address has an
 * account — otherwise this page answers "does this person use Hunch?" for
 * anyone who asks.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const problem =
    email.trim() === ""
      ? "Your email address, so we know where to send it."
      : email.includes("@")
        ? null
        : "That doesn't look like an email address.";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    // Enabled while incomplete, so pressing it explains rather than refuses.
    if (problem) {
      setTouched(true);
      document.getElementById("email")?.focus();
      return;
    }
    setError(null);
    setLoading(true);

    const res = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Couldn't send the link. Try again in a moment.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div>
        <Eyebrow>Check your inbox</Eyebrow>
        <Heading>Link sent</Heading>
        <Blurb>
          If {email.trim()} has a Hunch account, a reset link is on its way. It works once
          and expires in an hour.
        </Blurb>
        <Link href="/signin" className="auth-link" style={{ fontSize: 12.5, color: "var(--ink)", textDecoration: "none" }}>
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Locked out</Eyebrow>
      <Heading>Reset your password</Heading>
      <Blurb>Tell us the address on the account and we&apos;ll email you a link.</Blurb>

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-4">
          <Field data-invalid={touched && problem ? true : undefined}>
            <FieldLabel htmlFor="email" className={LABEL_CLASS}>
              Email
            </FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              aria-invalid={touched && problem ? true : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                setTouched(false);
              }}
              onBlur={() => setTouched(true)}
              placeholder="you@email.com"
              className="font-mono"
            />
            <FieldError className="text-xs">{touched ? problem : null}</FieldError>
          </Field>
        </FieldGroup>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" variant="brand" size="touch" disabled={loading} className={SUBMIT_CLASS}>
          {loading ? "Sending…" : "Email me a link →"}
        </Button>
      </form>

      <div style={{ marginTop: 24, fontSize: 12.5, color: "var(--muted)" }}>
        Remembered it?{" "}
        <Link href="/signin" className="auth-link" style={{ color: "var(--ink)", textDecoration: "none" }}>
          Sign in
        </Link>
      </div>
    </div>
  );
}

/**
 * Set a new password from an emailed token.
 *
 * Resetting revokes every other session (see auth.ts) — a reset is a recovery
 * from losing control of the account, so the old sessions shouldn't outlive it.
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const { setPasswordFocused } = useAuthGaze();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const problems = {
    password:
      password.length === 0
        ? "A new password, at least 8 characters."
        : password.length < 8
          ? `That's ${8 - password.length} characters short.`
          : null,
    confirm:
      confirm.length === 0
        ? "Type it a second time so a typo can't lock you out."
        : confirm !== password
          ? "These two don't match yet."
          : null,
  };
  // The short-password count is worth seeing as it's typed; the rest waits for
  // the user to leave the field.
  const shown = (field: keyof typeof problems) =>
    touched[field] || (field === "password" && password.length > 0)
      ? problems[field]
      : null;

  if (!token) {
    return (
      <div>
        <Eyebrow>Link expired</Eyebrow>
        <Heading>That link doesn&apos;t work</Heading>
        <Blurb>
          Reset links work once and expire after an hour. Ask for a fresh one and it&apos;ll
          be in your inbox in a moment.
        </Blurb>
        <Link href="/forgot-password" className="auth-link" style={{ fontSize: 12.5, color: "var(--ink)", textDecoration: "none" }}>
          Send a new link →
        </Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const firstBad = (["password", "confirm"] as const).find((f) => problems[f]);
    if (firstBad) {
      setTouched({ password: true, confirm: true });
      document.getElementById(firstBad)?.focus();
      return;
    }
    setError(null);
    setLoading(true);

    const res = await authClient.resetPassword({ newPassword: password, token: token! });

    if (res.error) {
      setLoading(false);
      setError(res.error.message ?? "Couldn't reset your password. Ask for a new link.");
      return;
    }
    router.push("/signin");
    router.refresh();
  }

  return (
    <div>
      <Eyebrow>Almost there</Eyebrow>
      <Heading>Pick a new password</Heading>
      <Blurb>
        At least 8 characters. Signing in again afterwards will sign out anywhere else
        you were logged in.
      </Blurb>

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-4">
          <Field data-invalid={shown("password") ? true : undefined}>
            <FieldLabel htmlFor="password" className={LABEL_CLASS}>
              New password
            </FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              aria-invalid={shown("password") ? true : undefined}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => {
                setPasswordFocused(false);
                setTouched((t) => ({ ...t, password: true }));
              }}
              placeholder="At least 8 characters"
              className="font-mono"
            />
            <FieldError className="text-xs">{shown("password")}</FieldError>
          </Field>

          <Field data-invalid={shown("confirm") ? true : undefined}>
            <FieldLabel htmlFor="confirm" className={LABEL_CLASS}>
              Again
            </FieldLabel>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              aria-invalid={shown("confirm") ? true : undefined}
              onChange={(e) => {
                setConfirm(e.target.value);
                setTouched((t) => ({ ...t, confirm: false }));
              }}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => {
                setPasswordFocused(false);
                setTouched((t) => ({ ...t, confirm: true }));
              }}
              placeholder="The same one"
              className="font-mono"
            />
            <FieldError className="text-xs">{shown("confirm")}</FieldError>
          </Field>
        </FieldGroup>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" variant="brand" size="touch" disabled={loading} className={SUBMIT_CLASS}>
          {loading ? "Saving…" : "Set new password →"}
        </Button>
      </form>
    </div>
  );
}
