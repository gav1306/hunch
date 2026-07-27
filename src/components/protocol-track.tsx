import type { Confounder, PowerInfo, ProtocolDesign } from "@/lib/schemas/protocol";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

/**
 * Renders an approved ABA design as a phase track: the A/B/A timeline with day
 * counts and washouts, the confounder controls, and the trial-length rationale.
 * Brand system — Clash Display headings, Space Mono labels, --ink/--paper/--rule.
 */
export function ProtocolTrack({
  design,
  powerInfo,
  confounders,
}: {
  design: ProtocolDesign;
  powerInfo: PowerInfo;
  confounders: Confounder[];
}) {
  return (
    <section
      style={{
        background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
        border: "1px solid var(--rule)",
        padding: "clamp(20px,2.4vw,28px)",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <h2 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(18px,2.2vw,24px)", letterSpacing: "-0.01em", color: "var(--ink)" }}>
        Your experiment plan
      </h2>

      <ol style={{ margin: "18px 0 0", padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {design.phases.map((phase, i) => {
          const intervention = phase.kind === "intervention";
          return (
            <li
              key={i}
              style={{
                flex: "1 1 140px",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "14px 12px",
                border: `1px solid ${intervention ? "var(--s1)" : "var(--rule)"}`,
                background: intervention ? "color-mix(in srgb,var(--paper) 82%,var(--s1))" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, fontWeight: 700, color: "var(--muted)", border: "1px solid var(--rule)", padding: "1px 6px" }}>
                  {phase.label}
                </span>
                <span style={label}>{intervention ? "Intervention" : "Baseline"}</span>
              </div>
              <span style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 16, lineHeight: 1.15, color: "var(--ink)", overflowWrap: "anywhere" }}>
                {phase.name}
              </span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)", overflowWrap: "anywhere" }}>
                {phase.action}
              </span>
              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11.5, color: "var(--muted)" }}>
                {phase.days} days
              </span>
            </li>
          );
        })}
      </ol>

      {design.washoutDays > 0 && (
        <p style={{ margin: "10px 0 0", ...label }}>
          {design.washoutDays}-day washout between phases
        </p>
      )}

      <p style={{ margin: "18px 0 0", fontSize: 14, lineHeight: 1.7, color: "var(--ink)", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
        {design.instructions}
      </p>

      {confounders.length > 0 && (
        <div style={{ marginTop: 22, borderTop: "1px solid var(--rule)", paddingTop: 18 }}>
          <div style={label}>Keep these steady</div>
          <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {confounders.map((c) => (
              <li key={c.name} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.5, color: "var(--ink)", minWidth: 0 }}>
                <span aria-hidden style={{ color: "var(--s1)" }}>·</span>
                <span style={{ overflowWrap: "anywhere" }}>{c.control}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ margin: "18px 0 0", fontSize: 12, lineHeight: 1.6, fontStyle: "italic", color: "var(--muted)" }}>
        {powerInfo.rationale}
      </p>
    </section>
  );
}
