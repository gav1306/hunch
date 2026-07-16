"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";

const REDIRECT = "/home";

type Mode = "signin" | "signup";

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
  outline: "none",
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const valid =
    email.includes("@") &&
    password.length >= 8 &&
    (!isSignup || name.trim().length > 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
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
        <span style={{ color: "var(--s1)" }}>✦</span>{" "}
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
        {isSignup && (
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>
              Name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada"
              style={inputStyle}
            />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="email" style={labelStyle}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label htmlFor="password" style={labelStyle}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={inputStyle}
          />
        </div>

        {error && (
          <div
            role="alert"
            style={{
              margin: "6px 0 4px",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--s1)",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!valid || loading}
          className="auth-submit"
          style={{
            width: "100%",
            marginTop: 18,
            padding: "15px 24px",
            border: "none",
            cursor: valid && !loading ? "pointer" : "not-allowed",
            fontFamily: "'Space Mono',monospace",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--paper)",
            background: "var(--ink)",
            opacity: valid && !loading ? 1 : 0.5,
            transition: "opacity 200ms ease, filter 200ms ease",
          }}
        >
          {loading
            ? "One moment…"
            : isSignup
              ? "Create account →"
              : "Sign in →"}
        </button>
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
