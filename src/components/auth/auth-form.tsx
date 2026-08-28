"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthGaze } from "@/components/auth/auth-gaze";
import { signIn, signUp } from "@/lib/auth-client";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

const REDIRECT = "/home";

type Mode = "signin" | "signup";

/** Uppercase mono, at the 12px readable floor rather than the old 10.5px. */
const LABEL_CLASS = "text-xs uppercase tracking-[0.16em] text-muted-foreground";

/**
 * What's wrong with one field, in the words the user needs — or null.
 *
 * Checked per field rather than as one `valid` boolean so the form can say
 * which field is the problem instead of greying out the submit and leaving the
 * user to guess.
 */
function problemWith(field: "name" | "email" | "password", value: string): string | null {
  if (field === "name") {
    return value.trim().length > 0 ? null : "Tell us what to call you.";
  }
  if (field === "email") {
    if (value.trim() === "") return "Your email address, so we know it's you.";
    return value.includes("@") ? null : "That doesn't look like an email address.";
  }
  if (value === "") return "A password, at least 8 characters.";
  return value.length >= 8 ? null : "Passwords need at least 8 characters.";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { setPasswordFocused } = useAuthGaze();
  const isSignup = mode === "signup";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // A field's problem is shown once the user has left it, or once they have
  // tried to submit. Typing into a field clears its complaint immediately.
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const problems = {
    name: isSignup ? problemWith("name", name) : null,
    email: problemWith("email", email),
    password: problemWith("password", password),
  };
  const shown = (field: keyof typeof problems) =>
    touched[field] ? problems[field] : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    // The submit button stays enabled when the form is incomplete: a disabled
    // button is a refusal with no reason attached. Pressing it names every
    // problem at once and moves focus to the first one.
    const firstBad = (["name", "email", "password"] as const).find((f) => problems[f]);
    if (firstBad) {
      setTouched({ name: true, email: true, password: true });
      document.getElementById(firstBad)?.focus();
      return;
    }

    setError(null);
    setLoading(true);

    const res = isSignup
      ? await signUp.email({ name: name.trim(), email, password })
      : await signIn.email({ email, password });

    if (res.error) {
      setLoading(false);
      setError(res.error.message ?? "Something went wrong. Try again.");
      return;
    }
    // If the account has 2FA on, sign-in returns a redirect instead of a session.
    if (
      !isSignup &&
      (res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect
    ) {
      router.push("/2fa");
      return;
    }
    router.push(REDIRECT);
    router.refresh();
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 14,
        }}
      >
        <span aria-hidden style={{ color: "var(--s1)" }}>✦</span>{" "}
        {isSignup ? "Start your first test" : "Welcome back"}
      </div>

      <h1
        style={{
          margin: "0 0 10px",
          fontFamily: "'Clash Display',sans-serif",
          fontWeight: 700,
          fontSize: "clamp(30px,4vw,44px)",
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {isSignup ? "Create your account" : "Sign in to hunch"}
      </h1>
      <p
        style={{
          margin: "0 0 28px",
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--muted)",
        }}
      >
        {isSignup
          ? "Turn a gut feeling into a real answer."
          : "Pick up where your hunches left off."}
      </p>

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-4">
          {isSignup && (
            <Field data-invalid={shown("name") ? true : undefined}>
              <FieldLabel htmlFor="name" className={LABEL_CLASS}>
                Name
              </FieldLabel>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                aria-invalid={shown("name") ? true : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setTouched((t) => ({ ...t, name: false }));
                }}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="Ada"
                className="font-mono"
              />
              <FieldError className="text-xs">{shown("name")}</FieldError>
            </Field>
          )}

          <Field data-invalid={shown("email") ? true : undefined}>
            <FieldLabel htmlFor="email" className={LABEL_CLASS}>
              Email
            </FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={shown("email") ? true : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                setTouched((t) => ({ ...t, email: false }));
              }}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="you@email.com"
              className="font-mono"
            />
            <FieldError className="text-xs">{shown("email")}</FieldError>
          </Field>

          <Field data-invalid={shown("password") ? true : undefined}>
            <FieldLabel htmlFor="password" className={LABEL_CLASS}>
              Password
            </FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              aria-invalid={shown("password") ? true : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                setTouched((t) => ({ ...t, password: false }));
              }}
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
        </FieldGroup>

        {!isSignup && (
          <div style={{ marginTop: 10, textAlign: "right" }}>
            <Link
              href="/forgot-password"
              className="auth-link"
              style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
            >
              Forgot password?
            </Link>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              margin: "10px 0 4px",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--s1)",
            }}
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="brand"
          size="touch"
          disabled={loading}
          className="auth-submit mt-[18px] w-full border-none bg-ink py-4 text-[13px] tracking-[0.14em] text-paper"
        >
          {loading ? "One moment…" : isSignup ? "Create account" : "Sign in"}
          {!loading && <ArrowRightIcon data-icon="inline-end" aria-hidden />}
        </Button>
      </form>

      <div
        style={{
          marginTop: 24,
          fontSize: 12.5,
          color: "var(--muted)",
        }}
      >
        {isSignup ? "Already have an account? " : "New to hunch? "}
        <Link
          href={isSignup ? "/signin" : "/signup"}
          className="auth-link"
          style={{ color: "var(--ink)", textDecoration: "none" }}
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </div>
    </div>
  );
}
