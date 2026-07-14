"use client";

import { useState } from "react";
import { twoFactor, useSession } from "@/lib/auth-client";

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
  maxWidth: 320,
  padding: "12px 14px",
  background: "color-mix(in srgb, var(--paper) 90%, var(--ink))",
  border: "1px solid var(--rule)",
  color: "var(--ink)",
  fontFamily: "'Space Mono',monospace",
  fontSize: 14,
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  marginTop: 16,
  padding: "13px 22px",
  border: "none",
  cursor: "pointer",
  fontFamily: "'Space Mono',monospace",
  fontWeight: 700,
  fontSize: 12.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--paper)",
  background: "var(--ink)",
};

export function SecuritySettings() {
  const { data: session, refetch } = useSession();
  const enabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  );

  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onEnable(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setError(null);
    setBusy(true);
    const res = await twoFactor.enable({ password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Couldn't turn it on. Check your password.");
      return;
    }
    setBackupCodes(res.data.backupCodes);
    setPassword("");
    refetch?.();
  }

  async function onDisable(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setError(null);
    setBusy(true);
    const res = await twoFactor.disable({ password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Couldn't turn it off. Check your password.");
      return;
    }
    setPassword("");
    setBackupCodes(null);
    refetch?.();
  }

  const card: React.CSSProperties = {
    maxWidth: 560,
    background: "color-mix(in srgb, var(--paper) 90%, var(--ink))",
    border: "1px solid var(--rule)",
    borderTop: "2px solid transparent",
    borderImage: "linear-gradient(90deg,var(--s1),var(--s2)) 1",
    padding: "clamp(24px,3vw,36px)",
  };

  return (
    <div>
      <h1
        style={{
          margin: "0 0 8px",
          fontFamily: "'Clash Display',sans-serif",
          fontWeight: 700,
          fontSize: "clamp(28px,4vw,42px)",
          letterSpacing: "-0.02em",
        }}
      >
        Security
      </h1>
      <p style={{ margin: "0 0 clamp(24px,4vh,40px)", fontSize: 13, color: "var(--muted)" }}>
        Add a second step at sign-in — we email you a code each time.
      </p>

      <div style={card}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: enabled ? "var(--s2)" : "var(--muted)",
            marginBottom: 14,
          }}
        >
          Two-factor by email · {enabled ? "On" : "Off"}
        </div>

        {/* Just enabled — show backup codes to save */}
        {backupCodes ? (
          <div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink)", margin: "0 0 6px" }}>
              Two-factor is on. From now on we&apos;ll email a code at sign-in.
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 16px" }}>
              Save these backup codes somewhere safe — each works once if you
              can&apos;t get the email.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                gap: "6px 20px",
                maxWidth: 320,
                fontFamily: "'Space Mono',monospace",
                fontSize: 13,
                color: "var(--ink)",
              }}
            >
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <button type="button" onClick={() => setBackupCodes(null)} style={btnStyle}>
              Done
            </button>
          </div>
        ) : enabled ? (
          /* Enabled: offer disable */
          <form onSubmit={onDisable}>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 16px" }}>
              We email a code at every sign-in. Enter your password to turn this
              off.
            </p>
            <label htmlFor="pw-off" style={labelStyle}>
              Password
            </label>
            <input
              id="pw-off"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            {error && <div style={{ marginTop: 10, fontSize: 12, color: "var(--s1)" }}>{error}</div>}
            <button
              type="submit"
              disabled={busy}
              style={{ ...btnStyle, background: "transparent", color: "var(--ink)", border: "1px solid var(--ink)" }}
            >
              {busy ? "Turning off…" : "Turn off"}
            </button>
          </form>
        ) : (
          /* Disabled: enable */
          <form onSubmit={onEnable}>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 16px" }}>
              Confirm your password to switch on email codes at sign-in.
            </p>
            <label htmlFor="pw-on" style={labelStyle}>
              Password
            </label>
            <input
              id="pw-on"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            {error && <div style={{ marginTop: 10, fontSize: 12, color: "var(--s1)" }}>{error}</div>}
            <button type="submit" disabled={busy} style={btnStyle}>
              {busy ? "Turning on…" : "Turn on email codes"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
