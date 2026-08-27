"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthGaze } from "@/components/auth/auth-gaze";
import { authClient } from "@/lib/auth-client";

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 15px",
  background: "color-mix(in srgb, var(--paper) 90%, var(--ink))",
  border: "1px solid var(--rule)",
  color: "var(--ink)",
  fontFamily: "'Space Mono',monospace",
  fontSize: 14,
};

function submitStyle(enabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 18,
    padding: "15px 24px",
    border: "none",
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: "'Space Mono',monospace",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--paper)",
    background: "var(--ink)",
    opacity: enabled ? 1 : 0.5,
    transition: "opacity 200ms ease, filter 200ms ease",
  };
}

/** The rest of the auth inputs set `outline: none` with no replacement, which
 *  leaves a keyboard user with nothing to follow. These new ones don't. */
const focusRing = `
  .reset-field:focus-visible { outline: 2px solid var(--s1); outline-offset: 2px; }
`;

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

  const valid = email.includes("@");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
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
      <style>{focusRing}</style>
      <Eyebrow>Locked out</Eyebrow>
      <Heading>Reset your password</Heading>
      <Blurb>Tell us the address on the account and we&apos;ll email you a link.</Blurb>

      <form onSubmit={onSubmit} noValidate>
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="email" style={labelStyle}>Email</label>
          <input
            id="email"
            className="reset-field"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            style={inputStyle}
          />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button type="submit" disabled={!valid || loading} className="auth-submit" style={submitStyle(valid && !loading)}>
          {loading ? "Sending…" : "Email me a link →"}
        </button>
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

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = password.length >= 8 && confirm === password;

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
    if (!valid || loading) return;
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
      <style>{focusRing}</style>
      <Eyebrow>Almost there</Eyebrow>
      <Heading>Pick a new password</Heading>
      <Blurb>
        At least 8 characters. Signing in again afterwards will sign out anywhere else
        you were logged in.
      </Blurb>

      <form onSubmit={onSubmit} noValidate>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="password" style={labelStyle}>New password</label>
          <input
            id="password"
            className="reset-field"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            placeholder="At least 8 characters"
            style={inputStyle}
          />
          {tooShort && <ErrorNote>That&apos;s {8 - password.length} characters short.</ErrorNote>}
        </div>

        <div style={{ marginBottom: 10 }}>
          <label htmlFor="confirm" style={labelStyle}>Again</label>
          <input
            id="confirm"
            className="reset-field"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            placeholder="The same one"
            style={inputStyle}
          />
          {mismatch && <ErrorNote>These two don&apos;t match yet.</ErrorNote>}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button type="submit" disabled={!valid || loading} className="auth-submit" style={submitStyle(valid && !loading)}>
          {loading ? "Saving…" : "Set new password →"}
        </button>
      </form>
    </div>
  );
}
