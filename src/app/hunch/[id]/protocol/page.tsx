"use client";

import Link from "next/link";
import { useMemo, useState, use } from "react";
import { ProtocolStepper } from "@/components/protocol-stepper";
import { AbandonHunch } from "@/components/hunch/abandon-hunch";
import { ParameterEditor } from "@/components/hunch/parameter-editor";
import { useDesignProtocol } from "@/hooks/use-design-protocol";
import { useHunchInfo } from "@/hooks/use-hunch-info";
import { draftsFromSharpened } from "@/lib/parameters";
import { parameterListSchema, type ParameterDraft } from "@/lib/schemas/parameter";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const mono = "'Space Mono',monospace";

const gateBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 18px",
  borderRadius: 11,
  fontFamily: mono,
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

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

  // What the read gives us: the persisted parameters if the sharpen step wrote
  // them, otherwise just the outcome as the primary. Derived, not stored — the
  // user's edits take over the moment they touch the list.
  const seeded = useMemo<ParameterDraft[] | null>(() => {
    if (!info.data) return null;
    const stored = info.data.parameters;
    return stored.length > 0
      ? stored.map((p) => ({
          label: p.label,
          type: p.type,
          unit: p.unit,
          min: p.min,
          max: p.max,
          isPrimary: p.isPrimary,
        }))
      : draftsFromSharpened({
          outcomeMetric: info.data.hypothesis.outcomeMetric,
          outcomeType: info.data.hypothesis.outcomeType,
        });
  }, [info.data]);

  const [edited, setEdited] = useState<ParameterDraft[] | null>(null);
  const drafts = edited ?? seeded;

  const cleaned = (drafts ?? []).filter((d) => d.label.trim() !== "");
  const canDesign = parameterListSchema.safeParse(cleaned).success;

  // Prefer a freshly-designed result; fall back to an already-stored protocol.
  const protocol = design.data?.protocol ?? info.data?.protocol ?? null;
  const hypothesis = design.data?.hypothesis ?? info.data?.hypothesis ?? null;
  const refusalReason = design.data?.safety.reason; // only present on a fresh design
  const refused = protocol?.safetyState === "refused";
  const approved = !!protocol && !refused;

  return (
    <div>
      {info.isPending && (
        <p aria-live="polite" style={{ ...label, textTransform: "none", letterSpacing: "0.04em" }}>Loading…</p>
      )}

      {info.isError && (
        <p role="alert" style={{ fontSize: 13, color: "var(--s1)", overflowWrap: "anywhere" }}>{info.error.message}</p>
      )}

      {/* Confirm gate — no protocol yet, hypothesis in hand, not mid-design */}
      {hypothesis && !approved && !refused && !design.isPending && (
        <div>
          <div style={{ background: "color-mix(in srgb,var(--paper) 90%,var(--ink))", border: "1px solid var(--rule)", borderLeft: "2px solid var(--s1)", borderRadius: 14, padding: "clamp(16px,2vw,20px)", minWidth: 0 }}>
            <div style={label}>What you&apos;re testing</div>
            <h2 style={{ margin: "8px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(17px,2.4vw,22px)", lineHeight: 1.28, letterSpacing: "-0.01em", color: "var(--ink)", overflowWrap: "anywhere" }}>
              {hypothesis.statement}
            </h2>
            <p style={{ margin: "10px 0 0", fontFamily: mono, fontSize: 11.5, color: "var(--muted)", overflowWrap: "anywhere" }}>
              You&apos;ll log this daily — edit anything that&apos;s off.
            </p>
          </div>

          {drafts && <ParameterEditor value={drafts} onChange={setEdited} />}

          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            {/* Re-sharpens this hunch, pre-filled with the words it started
                as. This used to link to a blank /hunch/new, which discarded
                the raw text and the clarifying answers and left the old
                hunch stranded in "Finish setting up" with no way to remove it. */}
            <Link href={`/hunch/new?resume=${id}`} style={{ ...gateBtn, flex: 1, border: "1px solid var(--ink)", background: "transparent", color: "var(--ink)", textDecoration: "none" }}>
              ↻ redo
            </Link>
            <button
              type="button"
              disabled={!canDesign}
              onClick={() => design.mutate(cleaned)}
              style={{
                ...gateBtn,
                flex: 1,
                border: "1px solid var(--s1)",
                background: canDesign ? "var(--s1)" : "transparent",
                color: canDesign ? "var(--paper)" : "var(--muted)",
                cursor: canDesign ? "pointer" : "not-allowed",
              }}
            >
              Looks right — design it →
            </button>
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
        <div role="alert" style={{ marginTop: 20, border: "1px solid var(--rule)", borderRadius: 14, background: "color-mix(in srgb,var(--paper) 86%,var(--ink))", padding: "16px 18px" }}>
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
            onClick={() => design.mutate(cleaned)}
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
        <section style={{ border: "1px solid var(--s1)", borderRadius: 16, background: "color-mix(in srgb,var(--paper) 88%,var(--ink))", padding: "clamp(20px,2.4vw,28px)" }}>
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

      {/* Reachable here too: home's setup cards point at this page, so a
          hunch the user gave up on mid-setup would otherwise have no exit. */}
      <div style={{ marginTop: 40, borderTop: "1px solid var(--rule)", paddingTop: 8 }}>
        <AbandonHunch hunchId={id} />
      </div>
    </div>
  );
}
