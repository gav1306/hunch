"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmBot } from "@/components/hunch/confirm-bot";
import { useCreateHunch, type HunchWithHypothesis } from "@/hooks/use-create-hunch";
import { appThemeStyle } from "@/lib/app-theme";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

function Pill({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "3px 10px",
        fontSize: 12,
        textTransform: "capitalize",
        border: muted ? "none" : "1px solid var(--rule)",
        background: muted ? "color-mix(in srgb,var(--paper) 82%,var(--ink))" : "transparent",
        color: "var(--ink)",
      }}
    >
      {children}
    </span>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt style={{ ...label, marginBottom: 6 }}>{l}</dt>
      <dd style={{ margin: 0, fontSize: 14, color: "var(--ink)" }}>{children}</dd>
    </div>
  );
}

function Result({ hunch, onReset }: { hunch: HunchWithHypothesis; onReset: () => void }) {
  const h = hunch.hypothesis;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ background: "color-mix(in srgb,var(--paper) 90%,var(--ink))", border: "1px solid var(--rule)", padding: "clamp(20px,2.4vw,28px)" }}>
        <p style={{ margin: 0, fontSize: 13, fontStyle: "italic", color: "var(--muted)" }}>
          &ldquo;{hunch.rawText}&rdquo;
        </p>
        <h2 style={{ margin: "14px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(18px,2.2vw,24px)", lineHeight: 1.25, letterSpacing: "-0.01em", color: "var(--ink)" }}>
          {h.statement}
        </h2>
        <dl style={{ margin: "18px 0 0", display: "grid", gap: 14 }}>
          <Field label="Outcome metric">{h.outcomeMetric}</Field>
          <Field label="Outcome type"><Pill>{h.outcomeType}</Pill></Field>
          {h.confounders.length > 0 && (
            <Field label="Watch for confounders">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {h.confounders.map((c) => <Pill key={c} muted>{c}</Pill>)}
              </div>
            </Field>
          )}
        </dl>
        {hunch.priors.length > 0 && (
          <div style={{ marginTop: 20, borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
            <div style={label}>You already learned</div>
            <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
              {hunch.priors.map((p) => (
                <li key={p.sourceHunchId} style={{ fontSize: 13, color: "var(--ink)" }}>
                  <span style={{ fontStyle: "italic" }}>{p.cause}</span>{" "}
                  <span style={{ color: "var(--muted)" }}>({Math.round(p.confidence * 100)}% confident)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Link
          href={`/hunch/${hunch.id}/protocol`}
          style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 24px", border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}
        >
          Design the protocol →
        </Link>
        <button
          type="button"
          onClick={onReset}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}
        >
          start over
        </button>
      </div>
    </div>
  );
}

export function NewHunchForm({ seed }: { seed: string }) {
  const [rawText, setRawText] = useState(seed);
  const createHunch = useCreateHunch();

  const phase: "idle" | "computing" | "done" = createHunch.data
    ? "done"
    : createHunch.isPending
      ? "computing"
      : "idle";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = rawText.trim();
    if (!text || createHunch.isPending) return;
    createHunch.mutate({ rawText: text, answers: [] });
  }

  function reset() {
    createHunch.reset();
    setRawText("");
  }

  return (
    <main style={{ minHeight: "100dvh", ...appThemeStyle() }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(20px,6vh,56px) 20px 96px" }}>
        <Link href="/home" style={{ ...label, textDecoration: "none" }}>← home</Link>

        {phase !== "done" && (
          <div style={{ marginTop: 40, opacity: phase === "computing" ? 0.4 : 1, transition: "opacity 300ms ease", pointerEvents: phase === "computing" ? "none" : "auto" }}>
            <h1 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(30px,4.4vw,48px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
              What&apos;s nagging you?
            </h1>
            <p style={{ margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)" }}>
              Drop a gut feeling about your life. The coach sharpens it into something you can actually test.
            </p>

            <form onSubmit={onSubmit} style={{ marginTop: 26 }}>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={3}
                autoFocus
                disabled={phase === "computing"}
                placeholder="coffee after lunch wrecks my sleep…"
                style={{ width: "100%", resize: "none", padding: "14px 16px", background: "color-mix(in srgb,var(--paper) 82%,var(--ink))", border: "1px solid var(--rule)", color: "var(--ink)", fontFamily: "inherit", fontSize: 15, lineHeight: 1.5, outline: "none" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--s1)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
              />
              <button
                type="submit"
                disabled={phase === "computing" || !rawText.trim()}
                style={{ marginTop: 14, padding: "14px 26px", border: "1px solid var(--ink)", background: rawText.trim() ? "var(--ink)" : "transparent", color: rawText.trim() ? "var(--paper)" : "var(--muted)", cursor: rawText.trim() ? "pointer" : "not-allowed", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase" }}
              >
                {phase === "computing" ? "Sharpening…" : "Sharpen it"}
              </button>
            </form>

            {createHunch.isError && (
              <div
                role="alert"
                style={{
                  marginTop: 20,
                  border: "1px solid var(--rule)",
                  background: "color-mix(in srgb,var(--paper) 86%,var(--ink))",
                  padding: "16px 18px",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span aria-hidden style={{ color: "var(--s1)" }}>
                    ✦
                  </span>
                  <div
                    style={{
                      fontFamily: "'Clash Display',sans-serif",
                      fontWeight: 600,
                      fontSize: 15.5,
                      color: "var(--ink)",
                    }}
                  >
                    The coach hit a snag
                  </div>
                </div>
                <p
                  style={{
                    margin: "8px 0 0 20px",
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "var(--muted)",
                  }}
                >
                  Your hunch is safe — this one&apos;s on our end. Give it another go
                  in a moment.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const t = rawText.trim();
                    if (t) createHunch.mutate({ rawText: t, answers: [] });
                  }}
                  disabled={createHunch.isPending || !rawText.trim()}
                  style={{
                    marginTop: 12,
                    marginLeft: 20,
                    padding: "9px 18px",
                    border: "1px solid var(--ink)",
                    background: "transparent",
                    color: "var(--ink)",
                    cursor: "pointer",
                    fontFamily: "'Space Mono',monospace",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {phase !== "idle" && (
          <div style={{ marginTop: phase === "done" ? 8 : 36 }}>
            {phase === "done" ? (
              <ConfirmBot play size={200} />
            ) : (
              <div style={{ width: 200, height: 200, margin: "0 auto" }} aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/starburst.png"
                  alt=""
                  aria-hidden
                  style={{ width: "60%", height: "60%", objectFit: "contain", opacity: 0.45, margin: "20% auto", display: "block" }}
                />
              </div>
            )}
            {phase === "computing" && (
              <p aria-live="polite" style={{ textAlign: "center", marginTop: 4, fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" }}>
                Sharpening…
              </p>
            )}
          </div>
        )}

        {phase === "done" && createHunch.data && (
          <Result hunch={createHunch.data} onReset={reset} />
        )}
      </div>
    </main>
  );
}
