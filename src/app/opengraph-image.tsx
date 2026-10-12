import { ImageResponse } from "next/og";

/**
 * The card a shared link unfurls into. Drawn in code so it tracks the landing's
 * own words and colours (`--paper`, `--ink`, `--s1`). The brand faces ship as
 * woff2, which the image renderer can't read, so it uses its built-in sans.
 */
export const alt = "Hunch — got a hunch? Prove it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#0e0d12",
          color: "#f2ecdd",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, color: "#8c8676" }}>
          FIELD LOG · A TEST OF ONE
        </div>
        <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1, marginTop: 28 }}>
          GOT A HUNCH?
        </div>
        <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1, color: "#ff3b14" }}>
          PROVE IT.
        </div>
        <div style={{ fontSize: 32, marginTop: 40, color: "#8c8676" }}>
          AI sharpens the question. Your own data decides the answer.
        </div>
      </div>
    ),
    size,
  );
}
