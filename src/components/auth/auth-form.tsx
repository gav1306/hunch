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

/** Google's "G", in its own colours, as its sign-in guidelines ask. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-4">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function AuthForm({ mode, google = false }: { mode: Mode; google?: boolean }) {
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
      ? // The verification link lands back in the app, signed in.
        await signUp.email({ name: name.trim(), email, password, callbackURL: "/home" })
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
      <p className="mt-0 mb-3.5 text-xs tracking-[0.24em] text-muted-foreground uppercase">
        <span aria-hidden className="text-s1">
          ✦
        </span>{" "}
        {isSignup ? "Start your first test" : "Welcome back"}
      </p>

      <h1 className="mt-0 mb-2.5 font-heading text-[clamp(30px,4vw,44px)] leading-none font-bold tracking-[-0.02em] text-ink">
        {isSignup ? "Create your account" : "Sign in to hunch"}
      </h1>
      <p className="mt-0 mb-7 text-sm leading-relaxed text-muted-foreground">
        {isSignup
          ? "Turn a gut feeling into a real answer."
          : "Pick up where your hunches left off."}
      </p>

      {google && (
        <>
          <Button
            type="button"
            variant="brand"
            size="touch"
            disabled={loading}
            className="w-full gap-2.5 py-4 text-[13px] tracking-[0.14em]"
            onClick={async () => {
              setError(null);
              setLoading(true);
              // Navigates away to Google; only a failure to start comes back here.
              const res = await signIn.social({ provider: "google", callbackURL: REDIRECT });
              if (res?.error) {
                setLoading(false);
                setError(res.error.message ?? "Couldn't reach Google. Try again.");
              }
            }}
          >
            <GoogleMark />
            Continue with Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs tracking-[0.16em] text-muted-foreground uppercase">
            <span aria-hidden className="h-px flex-1 bg-rule" />
            or with email
            <span aria-hidden className="h-px flex-1 bg-rule" />
          </div>
        </>
      )}

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
          <div className="mt-2.5 text-right">
            <Link
              href="/forgot-password"
              className="auth-link text-xs text-muted-foreground no-underline"
            >
              Forgot password?
            </Link>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-2.5 mb-1 text-xs leading-normal text-s1">
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

      <div className="mt-6 text-xs text-muted-foreground">
        {isSignup ? "Already have an account? " : "New to hunch? "}
        <Link
          href={isSignup ? "/signin" : "/signup"}
          className="auth-link text-ink no-underline"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </div>
    </div>
  );
}
