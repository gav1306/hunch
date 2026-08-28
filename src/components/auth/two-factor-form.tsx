"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { twoFactor } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

/** Uppercase mono, at the 12px readable floor rather than the old 10.5px. */
const LABEL_CLASS = "text-xs uppercase tracking-[0.16em] text-muted-foreground";

export function TwoFactorForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  // Off by default. This is a security decision, and the screen it's on may
  // well be a borrowed machine — the user opts in, we don't opt in for them.
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const sentOnce = useRef(false);
  // Resend had no cooldown and no feedback beyond the paragraph above flicking
  // back, so the only way to tell it had worked was to have been watching.
  const [cooldown, setCooldown] = useState(0);

  // Email the code as soon as the user lands here.
  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    twoFactor.sendOtp().then((res) => {
      if (res.error) {
        setError(res.error.message ?? "Couldn't send your code.");
        return;
      }
      setSent(true);
      // A code has just gone out, so the cooldown starts here too — otherwise
      // "resend" is available the instant the page loads.
      setCooldown(30);
    });
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    if (cooldown > 0) return;
    setError(null);
    setSent(false);
    const res = await twoFactor.sendOtp();
    if (res.error) {
      setError(res.error.message ?? "Couldn't resend your code.");
      return;
    }
    setSent(true);
    setCooldown(30);
  }

  const [touched, setTouched] = useState(false);
  const problem = backup
    ? code.trim().length > 0
      ? null
      : "Enter one of the backup codes you saved."
    : code.trim().length === 6
      ? null
      : "The emailed code is 6 digits.";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    // Enabled while the code is short: pressing it says what's missing rather
    // than sitting there greyed out.
    if (problem) {
      setTouched(true);
      document.getElementById("code")?.focus();
      return;
    }
    setError(null);
    setLoading(true);

    const res = backup
      ? await twoFactor.verifyBackupCode({ code: code.trim() })
      : await twoFactor.verifyOtp({ code: code.trim(), trustDevice: trust });

    if (res.error) {
      setLoading(false);
      setError(res.error.message ?? "That code didn't work. Try again.");
      return;
    }
    router.push("/home");
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
        <span style={{ color: "var(--s1)" }}>✦</span> Security check
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
        Two-factor
      </h1>
      <p style={{ margin: "0 0 28px", fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>
        {backup
          ? "Enter one of your saved backup codes."
          : sent
            ? "We emailed you a 6-digit code. Enter it below."
            : "Sending a 6-digit code to your email…"}
      </p>

      <form onSubmit={onSubmit} noValidate>
        <Field data-invalid={touched && problem ? true : undefined}>
          <FieldLabel htmlFor="code" className={LABEL_CLASS}>
            {backup ? "Backup code" : "Email code"}
          </FieldLabel>
          <Input
            id="code"
            type="text"
            inputMode={backup ? "text" : "numeric"}
            autoComplete="one-time-code"
            value={code}
            aria-invalid={touched && problem ? true : undefined}
            onChange={(e) => {
              setCode(backup ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6));
              setTouched(false);
            }}
            onBlur={() => setTouched(true)}
            placeholder={backup ? "xxxxxxxxxx" : "000000"}
            autoFocus
            className="font-mono text-lg tracking-[0.3em]"
          />
          <FieldError className="text-xs">{touched ? problem : null}</FieldError>
        </Field>

        {!backup && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 16,
              fontSize: 12,
              color: "var(--muted)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={trust}
              onChange={(e) => setTrust(e.target.checked)}
              style={{ accentColor: "var(--s1)", width: 16, height: 16 }}
            />
            Trust this device for 30 days
          </label>
        )}

        {error && (
          <div role="alert" style={{ margin: "12px 0 0", fontSize: 12, color: "var(--s1)" }}>
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="brand"
          size="touch"
          disabled={loading}
          className="auth-submit mt-5 w-full border-none bg-ink py-4 text-[13px] tracking-[0.14em] text-paper"
        >
          {loading ? "Verifying…" : "Verify →"}
        </Button>
      </form>

      <div style={{ marginTop: 24, display: "flex", gap: 18, flexWrap: "wrap" }}>
        {!backup && (
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0}
            className="auth-link"
            style={{
              ...linkBtn,
              cursor: cooldown > 0 ? "default" : "pointer",
              opacity: cooldown > 0 ? 0.5 : 1,
            }}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setBackup((v) => !v);
            setCode("");
            setError(null);
          }}
          className="auth-link"
          style={linkBtn}
        >
          {backup ? "← Use email code" : "Use a backup code instead"}
        </button>
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "'Space Mono',monospace",
  fontSize: 12.5,
  color: "var(--muted)",
};
