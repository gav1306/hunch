"use client";

import Link from "next/link";
import { use } from "react";
import { ProtocolTrack } from "@/components/protocol-track";
import { useDesignProtocol } from "@/hooks/use-design-protocol";
import { appThemeStyle } from "@/lib/app-theme";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

/**
 * Phase 3 UI: design a protocol for a hunch and render the phase track when
 * approved, or the "talk to a doctor" refusal panel when the Safety Reviewer
 * refuses. Hunch is NOT medical advice. Shell-less authed page — spreads
 * appThemeStyle() onto its own root (matches the focused add-hunch page).
 */
export default function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const design = useDesignProtocol(id);
  const data = design.data;
  const refused = data?.protocol.safetyState === "refused";
  const idle = !design.isPending && !data;

  return (
    <main style={{ minHeight: "100dvh", ...appThemeStyle() }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(20px,6vh,56px) 20px 96px" }}>
        <Link href="/home" style={{ ...label, textDecoration: "none" }}>← home</Link>

        <div style={{ marginTop: 40 }}>
          <h1 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(30px,4.4vw,48px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
            Design your protocol
          </h1>
          <p style={{ margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)" }}>
            We&apos;ll turn your hypothesis into a safe, runnable n-of-1 experiment.
          </p>

          <button
            type="button"
            onClick={() => design.mutate()}
            disabled={design.isPending}
            style={{
              marginTop: 26,
              padding: "14px 26px",
              border: "1px solid var(--ink)",
              background: design.isPending ? "transparent" : "var(--ink)",
              color: design.isPending ? "var(--muted)" : "var(--paper)",
              cursor: design.isPending ? "not-allowed" : "pointer",
              fontFamily: "'Space Mono',monospace",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {design.isPending ? "Designing…" : idle ? "Design my protocol" : "Redesign protocol"}
          </button>

          {design.isError && (
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
                <span aria-hidden style={{ color: "var(--s1)" }}>✦</span>
                <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 15.5, color: "var(--ink)" }}>
                  Couldn&apos;t design this one
                </div>
              </div>
              <p style={{ margin: "8px 0 0 20px", fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>
                {design.error.message}
              </p>
            </div>
          )}

          {data && !refused && (
            <div style={{ marginTop: 28 }}>
              <ProtocolTrack
                design={data.protocol.design}
                powerInfo={data.protocol.powerInfo}
                confounders={data.protocol.confounders}
              />
              <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                <Link
                  href={`/hunch/${id}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 24px", border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}
                >
                  Start experiment →
                </Link>
                <span style={{ ...label, textTransform: "none", letterSpacing: "0.02em", fontSize: 12 }}>
                  Your trial is live — check in once a day.
                </span>
              </div>
            </div>
          )}

          {data && refused && (
            <section
              style={{
                marginTop: 28,
                border: "1px solid var(--s1)",
                background: "color-mix(in srgb,var(--paper) 88%,var(--ink))",
                padding: "clamp(20px,2.4vw,28px)",
              }}
            >
              <h2 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(18px,2.2vw,22px)", letterSpacing: "-0.01em", color: "var(--ink)" }}>
                Let&apos;s not run this one on your own
              </h2>
              <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--ink)" }}>
                {data.safety.reason}
              </p>
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
