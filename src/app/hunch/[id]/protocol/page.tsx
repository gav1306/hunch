"use client";

import Link from "next/link";
import { use } from "react";
import { ProtocolStepper } from "@/components/protocol-stepper";
import { useDesignProtocol } from "@/hooks/use-design-protocol";
import { useHunchInfo } from "@/hooks/use-hunch-info";
import { appThemeStyle } from "@/lib/app-theme";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const mono = "'Space Mono',monospace";

/**
 * Phase 3 UI — Variation B: confirm the sharpened hypothesis, then design the
 * protocol and step through it, all on one page. The design does NOT auto-run;
 * the user approves first (or redoes). Approved → the phase stepper; refused →
 * the "talk to a doctor" panel. Hunch is NOT medical advice. Shell-less authed
 * page — spreads appThemeStyle() onto its own root.
 */
export default function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const info = useHunchInfo(id);
  const design = useDesignProtocol(id);

  // Prefer a freshly-designed result; fall back to an already-stored protocol.
  const protocol = design.data?.protocol ?? info.data?.protocol ?? null;
  const hypothesis = design.data?.hypothesis ?? info.data?.hypothesis ?? null;
  const refusalReason = design.data?.safety.reason; // only present on a fresh design
  const refused = protocol?.safetyState === "refused";
  const approved = !!protocol && !refused;

  return (
    <main style={{ minHeight: "100dvh", ...appThemeStyle() }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(20px,6vh,56px) 20px 96px" }}>
        <Link href="/home" style={{ ...label, textDecoration: "none" }}>← home</Link>

        <div style={{ marginTop: 40 }}>
          {info.isPending && (
            <p aria-live="polite" style={{ ...label, textTransform: "none", letterSpacing: "0.04em" }}>Loading…</p>
          )}

          {info.isError && (
            <p role="alert" style={{ fontSize: 13, color: "var(--s1)", overflowWrap: "anywhere" }}>{info.error.message}</p>
          )}

          {/* Confirm gate — no protocol yet, hypothesis in hand, not mid-design */}
          {hypothesis && !approved && !refused && !design.isPending && (
            <div>
              <h1 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(28px,4vw,44px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
                Ready to design it?
              </h1>
              <p style={{ margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)" }}>
                Here&apos;s what we&apos;ll build a safe, runnable n-of-1 experiment around.
              </p>

              <div style={{ marginTop: 26, background: "color-mix(in srgb,var(--paper) 90%,var(--ink))", border: "1px solid var(--rule)", borderLeft: "2px solid var(--s1)", padding: "clamp(20px,2.4vw,28px)", minWidth: 0 }}>
                <div style={label}>What you&apos;re testing</div>
                <h2 style={{ margin: "10px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(19px,2.4vw,26px)", lineHeight: 1.25, letterSpacing: "-0.01em", color: "var(--ink)", overflowWrap: "anywhere" }}>
                  {hypothesis.statement}
                </h2>
                <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "var(--muted)", overflowWrap: "anywhere" }}>
                  Measured by {hypothesis.outcomeMetric}
                </p>
              </div>

              <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => design.mutate()}
                  style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 24px", border: "1px solid var(--s1)", background: "var(--s1)", color: "var(--paper)", fontFamily: mono, fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}
                >
                  Looks right — design it →
                </button>
                <Link href="/hunch/new" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: mono, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", textDecoration: "none" }}>
                  ↻ redo
                </Link>
              </div>
            </div>
          )}

          {design.isPending && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <p aria-live="polite" style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" }}>
                Designing your experiment…
              </p>
            </div>
          )}

          {design.isError && (
            <div role="alert" style={{ marginTop: 20, border: "1px solid var(--rule)", background: "color-mix(in srgb,var(--paper) 86%,var(--ink))", padding: "16px 18px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span aria-hidden style={{ color: "var(--s1)" }}>✦</span>
                <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 15.5, color: "var(--ink)" }}>
                  Couldn&apos;t design this one
                </div>
              </div>
              <p style={{ margin: "8px 0 0 20px", fontSize: 13, lineHeight: 1.6, color: "var(--muted)", overflowWrap: "anywhere" }}>
                {design.error.message}
              </p>
              <button
                type="button"
                onClick={() => design.mutate()}
                style={{ margin: "12px 0 0 20px", background: "none", border: "none", cursor: "pointer", fontFamily: mono, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--s1)" }}
              >
                ↻ try again
              </button>
            </div>
          )}

          {approved && hypothesis && protocol && !design.isPending && (
            <ProtocolStepper
              hunchId={id}
              hypothesis={hypothesis}
              design={protocol.design}
              powerInfo={protocol.powerInfo}
              confounders={protocol.confounders}
            />
          )}

          {refused && !design.isPending && (
            <section style={{ border: "1px solid var(--s1)", background: "color-mix(in srgb,var(--paper) 88%,var(--ink))", padding: "clamp(20px,2.4vw,28px)" }}>
              <h2 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(18px,2.2vw,22px)", letterSpacing: "-0.01em", color: "var(--ink)" }}>
                Let&apos;s not run this one on your own
              </h2>
              {refusalReason && (
                <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--ink)", overflowWrap: "anywhere" }}>
                  {refusalReason}
                </p>
              )}
              <p style={{ margin: "16px 0 0", ...label }}>
                Hunch is not medical advice — please talk to a doctor before trying this.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
