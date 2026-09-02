import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { exportFilename, toCsv, toText, type ExportHunch } from "@/lib/export";

/**
 * Hand the experiment over as a file — `?format=csv` for the raw days,
 * `?format=txt` for the whole story. Content-Disposition: attachment, so the
 * browser saves it rather than rendering a wall of text in a tab.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const format =
    new URL(request.url).searchParams.get("format") === "txt" ? "txt" : "csv";

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: {
      hypothesis: true,
      protocol: true,
      verdict: true,
      parameters: { orderBy: { sortOrder: "asc" } },
      checkIns: {
        orderBy: { loggedOn: "asc" },
        include: { values: { select: { parameterId: true, value: true } } },
      },
    },
  });
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  const data: ExportHunch = {
    statement: hunch.hypothesis.statement,
    outcomeMetric: hunch.hypothesis.outcomeMetric,
    rawText: hunch.rawText,
    startedAt: hunch.protocol?.startedAt ?? null,
    parameters: hunch.parameters.map((p) => ({
      id: p.id,
      label: p.label,
      unit: p.unit,
      isPrimary: p.isPrimary,
    })),
    checkIns: hunch.checkIns.map((c) => ({
      loggedOn: c.loggedOn,
      phase: c.phase,
      values: c.values,
    })),
    verdict: hunch.verdict
      ? {
          category: hunch.verdict.category,
          narrative: hunch.verdict.narrative,
          pEffect: hunch.verdict.pEffect,
          effect: hunch.verdict.effect,
          ci: [hunch.verdict.ciLow, hunch.verdict.ciHigh],
          nA: hunch.verdict.nA,
          nB: hunch.verdict.nB,
        }
      : null,
  };

  const body = format === "csv" ? toCsv(data) : toText(data);
  return new Response(body, {
    headers: {
      "Content-Type":
        format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(data, format)}"`,
      "Cache-Control": "no-store",
    },
  });
}
