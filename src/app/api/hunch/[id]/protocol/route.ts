import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { designProtocol, resolveSafetyState } from "@/mastra/workflows/design";

/**
 * Phase 3: design a protocol for a sharpened hunch. Runs the design workflow
 * (confounders -> trial length -> ABA design -> safety review), applies the
 * safety gate, persists the Protocol, and flips the hunch to "running" only
 * when approved.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: { hypothesis: true },
  });
  if (!hunch) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (!hunch.hypothesis || hunch.status === "draft") {
    return NextResponse.json(
      { error: "Sharpen this hunch into a hypothesis first." },
      { status: 409 },
    );
  }

  const result = await designProtocol({
    statement: hunch.hypothesis.statement,
    outcomeMetric: hunch.hypothesis.outcomeMetric,
    outcomeType: hunch.hypothesis.outcomeType as "binary" | "continuous",
    confounderNames: hunch.hypothesis.confounders,
  });

  const safetyState = resolveSafetyState(result.safety);

  const protocol = await db.protocol.upsert({
    where: { hunchId: hunch.id },
    create: {
      hunchId: hunch.id,
      design: result.design,
      powerInfo: result.powerInfo,
      confounders: result.confounders,
      safetyState,
      startedAt: safetyState === "approved" ? new Date() : null,
    },
    update: {
      design: result.design,
      powerInfo: result.powerInfo,
      confounders: result.confounders,
      safetyState,
      startedAt: safetyState === "approved" ? new Date() : null,
    },
  });

  if (safetyState === "approved") {
    await db.hunch.update({ where: { id: hunch.id }, data: { status: "running" } });
  }

  return NextResponse.json({ protocol, safety: result.safety }, { status: 201 });
}
