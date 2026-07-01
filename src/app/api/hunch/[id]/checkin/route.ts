import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeBelief } from "@/lib/bayes";
import { currentPhase } from "@/lib/schedule";
import { checkInInputSchema } from "@/lib/schemas/belief";
import { protocolDesignSchema } from "@/lib/schemas/protocol";

/** UTC calendar date (midnight) for today — the per-day check-in bucket. */
function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Phase 4: log a one-tap check-in for today's phase. The server derives the phase
 * from the schedule (never trusts the client), refuses washout / pre-start / post-
 * end days, upserts one row per UTC day (overwrite), and returns the recomputed
 * belief so the meter narrows immediately.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: { hypothesis: true, protocol: true },
  });
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (hunch.status !== "running" || !hunch.protocol?.startedAt || hunch.protocol.safetyState !== "approved") {
    return NextResponse.json(
      { error: "This hunch is not running yet." },
      { status: 409 },
    );
  }

  const parsed = checkInInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A check-in needs a numeric value." }, { status: 400 });
  }

  const design = protocolDesignSchema.parse(hunch.protocol.design);
  const status = currentPhase(hunch.protocol.startedAt, design, new Date());
  if (status.done) {
    return NextResponse.json({ error: "This trial is complete." }, { status: 409 });
  }
  if (status.washout || status.phase === null) {
    return NextResponse.json({ error: "Today is a rest day — nothing to log." }, { status: 409 });
  }

  const loggedOn = utcToday();
  const checkIn = await db.checkIn.upsert({
    where: { hunchId_loggedOn: { hunchId: hunch.id, loggedOn } },
    create: { hunchId: hunch.id, phase: status.phase, value: parsed.data.value, loggedOn },
    update: { phase: status.phase, value: parsed.data.value },
  });

  const all = await db.checkIn.findMany({ where: { hunchId: hunch.id } });
  const belief = computeBelief(
    all.map((c) => ({ phase: c.phase, value: c.value })),
    hunch.hypothesis.outcomeType as "binary" | "continuous",
  );

  return NextResponse.json({ checkIn, belief }, { status: 201 });
}
