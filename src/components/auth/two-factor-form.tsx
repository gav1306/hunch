"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { twoFactor } from "@/lib/auth-client";

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
  fontSize: 18,
  letterSpacing: "0.3em",
  outline: "none",
};

export function TwoFactorForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [trust, setTrust] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const sentOnce = useRef(false);

  // Email the code as soon as the user lands here.
  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    twoFactor.sendOtp().then((res) => {
      if (res.error) setError(res.error.message ?? "Couldn't send your code.");
      else setSent(true);
    });
  }, []);

  async function resend() {
    setError(null);
    setSent(false);
    const res = await twoFactor.sendOtp();
    if (res.error) setError(res.error.message ?? "Couldn't resend your code.");
    else setSent(true);
  }

  const valid = backup ? code.trim().length > 0 : code.trim().length === 6;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
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
        <label htmlFor="code" style={labelStyle}>
          {backup ? "Backup code" : "Email code"}
        </label>
        <input
          id="code"
          type="text"
          inputMode={backup ? "text" : "numeric"}
          autoComplete="one-time-code"
          value={code}
          onChange={(e) =>
            setCode(backup ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder={backup ? "xxxxxxxxxx" : "000000"}
          autoFocus
          style={inputStyle}
        />

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
            <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
            Trust this device for 30 days
          </label>
        )}

        {error && (
          <div role="alert" style={{ margin: "12px 0 0", fontSize: 12, color: "var(--s1)" }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!valid || loading}
          className="auth-submit"
          style={{
            width: "100%",
            marginTop: 20,
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
          {loading ? "Verifying…" : "Verify →"}
        </button>
      </form>

      <div style={{ marginTop: 24, display: "flex", gap: 18, flexWrap: "wrap" }}>
        {!backup && (
          <button type="button" onClick={resend} className="auth-link" style={linkBtn}>
            Resend code
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
