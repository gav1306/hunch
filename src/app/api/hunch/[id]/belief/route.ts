import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeBelief } from "@/lib/bayes";
import { currentPhase } from "@/lib/schedule";
import { protocolDesignSchema } from "@/lib/schemas/protocol";

/**
 * Phase 4: compute-on-read belief. Reads every check-in for the hunch, runs the
 * Bayesian engine fresh, and returns the posterior plus today's schedule so the
 * UI knows whether logging is open. No stored snapshots.
 */
export async function GET(
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
    include: { hypothesis: true, protocol: true, checkIns: { orderBy: { loggedAt: "asc" } } },
  });
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  const outcomeType = hunch.hypothesis.outcomeType as "binary" | "continuous";
  const belief = computeBelief(
    hunch.checkIns.map((c) => ({ phase: c.phase, value: c.value })),
    outcomeType,
  );

  let schedule = null;
  if (hunch.protocol?.startedAt) {
    const design = protocolDesignSchema.parse(hunch.protocol.design);
    schedule = currentPhase(hunch.protocol.startedAt, design, new Date());
  }

  return NextResponse.json({
    belief,
    checkIns: hunch.checkIns.map((c) => ({
      phase: c.phase,
      value: c.value,
      loggedAt: c.loggedAt,
    })),
    schedule,
  });
}
