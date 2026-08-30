/**
 * The experiment as a file the user keeps.
 *
 * A verdict the app can show but not hand over is a record the user does not
 * own. Two shapes: CSV for the raw days, so the numbers can go into a
 * spreadsheet or a doctor's hands, and text for the story — hypothesis,
 * verdict, every logged day underneath it.
 *
 * Pure functions over plain values: the route reads, this formats, so both
 * shapes are testable without a database.
 */

export type ExportParameter = { id: string; label: string; unit: string | null };

export type ExportCheckIn = {
  loggedOn: Date;
  phase: string;
  values: { parameterId: string; value: number }[];
};

export type ExportVerdict = {
  category: string;
  narrative: string;
  pEffect: number;
  effect: number;
  ci: [number, number];
  nA: number;
  nB: number;
};

export type ExportHunch = {
  statement: string;
  outcomeMetric: string;
  rawText: string;
  startedAt: Date | null;
  parameters: ExportParameter[];
  checkIns: ExportCheckIn[];
  verdict: ExportVerdict | null;
};

/** The verdict categories, in the words the app uses on screen. */
const CATEGORY_TEXT: Record<string, string> = {
  helped: "It helped",
  hurt: "It hurt",
  inconclusive_no_effect: "No detectable effect",
  inconclusive_insufficient: "Not enough data",
};

/** `2026-08-01` — the UTC calendar date, which is how check-ins are stored. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** RFC 4180: quote a field that holds a comma, a quote or a newline. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The column header for a parameter — its unit in brackets when it has one. */
function columnLabel(p: ExportParameter): string {
  return p.unit ? `${p.label} (${p.unit})` : p.label;
}

/** One row per logged day, one column per parameter. Unlogged cells stay empty. */
export function toCsv(h: ExportHunch): string {
  const header = ["date", "phase", ...h.parameters.map(columnLabel)].map(csvCell);
  const rows = h.checkIns.map((c) => {
    const byId = new Map(c.values.map((v) => [v.parameterId, v.value]));
    return [
      isoDate(c.loggedOn),
      c.phase,
      ...h.parameters.map((p) => {
        const v = byId.get(p.id);
        return v === undefined ? "" : String(v);
      }),
    ].map(csvCell);
  });
  return [header, ...rows].map((r) => r.join(",")).join("\n") + "\n";
}

/** The whole experiment as prose: what was tested, what came back, every day. */
export function toText(h: ExportHunch): string {
  const lines: string[] = [];
  lines.push("HUNCH — an n-of-1 experiment");
  lines.push("");
  lines.push(`Hypothesis: ${h.statement}`);
  lines.push(`Outcome measured: ${h.outcomeMetric}`);
  lines.push(`In your words: ${h.rawText}`);
  lines.push(`Started: ${h.startedAt ? isoDate(h.startedAt) : "not started"}`);
  lines.push("");

  if (h.verdict) {
    const v = h.verdict;
    lines.push("VERDICT");
    lines.push(`${CATEGORY_TEXT[v.category] ?? v.category} — ${Math.round(v.pEffect * 100)}% sure`);
    lines.push(v.narrative);
    lines.push(
      `Effect: ${v.effect.toFixed(2)} (95% credible interval ${v.ci[0].toFixed(2)} to ` +
        `${v.ci[1].toFixed(2)}); ${v.nA} baseline days, ${v.nB} intervention days.`,
    );
  } else {
    lines.push("VERDICT");
    lines.push("No verdict yet — this experiment is still running.");
  }
  lines.push("");

  lines.push("THE DAYS");
  if (h.checkIns.length === 0) {
    lines.push("Nothing logged yet.");
  } else {
    for (const c of h.checkIns) {
      const byId = new Map(c.values.map((v) => [v.parameterId, v.value]));
      const readings = h.parameters
        .filter((p) => byId.has(p.id))
        .map((p) => `${columnLabel(p)}: ${byId.get(p.id)}`)
        .join("; ");
      lines.push(`${isoDate(c.loggedOn)}  phase ${c.phase}  ${readings}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** A filename the user can find later: the hypothesis, slugged. */
export function exportFilename(h: ExportHunch, format: "csv" | "txt"): string {
  const slug = h.statement
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || "hunch"}.${format}`;
}
