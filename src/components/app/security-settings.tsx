"use client";

import { useState } from "react";
import { twoFactor, useSession } from "@/lib/auth-client";

/**
 * The ten one-time codes, with a way to actually keep them.
 *
 * They used to render as bare text, shown exactly once, above a "Done" button
 * that discarded them for good — no copy, no download, no confirmation. The
 * realistic outcome was that nobody saved them, which turns a lost inbox into a
 * permanently locked account.
 */
function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const asText = [
    "Hunch backup codes",
    "Each code works once, in place of an emailed sign-in code.",
    "",
    ...codes,
    "",
  ].join("\n");

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin, denied permission) — the download
      // and the on-screen codes are both still there.
      setCopied(false);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([asText], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hunch-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink)", margin: "0 0 6px" }}>
        Two-factor is on. From now on we&apos;ll email a code at sign-in.
      </p>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 16px" }}>
        Save these somewhere safe — each works once if you can&apos;t get the email.
        You won&apos;t see them again.
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
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
        <button type="button" onClick={copyAll} style={secondaryBtn}>
          {copied ? "Copied ✓" : "Copy all"}
        </button>
        <button type="button" onClick={download} style={secondaryBtn}>
          Download .txt
        </button>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 20,
          fontSize: 12.5,
          color: "var(--ink)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          style={{ accentColor: "var(--s1)", width: 16, height: 16 }}
        />
        I&apos;ve saved these somewhere safe
      </label>

      <button
        type="button"
        disabled={!saved}
        onClick={onDone}
        style={{
          ...btnStyle,
          cursor: saved ? "pointer" : "not-allowed",
          opacity: saved ? 1 : 0.5,
        }}
      >
        Done
      </button>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const inputStyle: React.CSSProperties = {
  // Block, so a short button ("Turn off") drops below it rather than sitting
  // beside it — a long one ("Turn on email codes") already wrapped anyway.
  display: "block",
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

const secondaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  cursor: "pointer",
  fontFamily: "'Space Mono',monospace",
  fontWeight: 700,
  fontSize: 11.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink)",
  background: "transparent",
  border: "1px solid var(--rule)",
  borderRadius: "var(--radius-control)",
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
  // Turning 2FA off is a security downgrade, so it asks before it lands and
  // says so afterwards — it used to do neither, just re-rendering in the other
  // state with no acknowledgement that anything had changed.
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
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
    setConfirmingOff(false);
    setNotice("Two-factor is off. Sign-in now needs only your password.");
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
            color: enabled ? "var(--good)" : "var(--muted)",
            marginBottom: 14,
          }}
        >
          Two-factor by email · {enabled ? "On" : "Off"}
        </div>

        {notice && (
          <p
            role="status"
            style={{
              margin: "0 0 16px",
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "var(--good)",
            }}
          >
            {notice}
          </p>
        )}

        {/* Just enabled — show backup codes to save */}
        {backupCodes ? (
          <BackupCodes codes={backupCodes} onDone={() => setBackupCodes(null)} />
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

            {confirmingOff ? (
              <div style={{ marginTop: 16 }}>
                <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6, color: "var(--ink)" }}>
                  Without email codes, your password is the only thing standing
                  between someone and your account. Your backup codes stop working too.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button
                    type="submit"
                    disabled={busy}
                    style={{ ...btnStyle, marginTop: 0, background: "var(--s1)", color: "var(--paper)" }}
                  >
                    {busy ? "Turning off…" : "Yes, turn it off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingOff(false)}
                    style={{ ...secondaryBtn, padding: "13px 22px", fontSize: 12.5 }}
                  >
                    Keep it on
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy || !password}
                onClick={() => setConfirmingOff(true)}
                style={{
                  ...btnStyle,
                  background: "transparent",
                  color: "var(--ink)",
                  border: "1px solid var(--ink)",
                  cursor: password ? "pointer" : "not-allowed",
                  opacity: password ? 1 : 0.5,
                }}
              >
                Turn off
              </button>
            )}
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
