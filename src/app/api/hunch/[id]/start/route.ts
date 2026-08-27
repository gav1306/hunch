import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { startDateFor } from "@/lib/schedule";

const startInputSchema = z.object({
  startOn: z.enum(["today", "tomorrow"]).default("today"),
});

/**
 * Start a designed trial.
 *
 * Designing and starting used to be the same request: the design POST stamped
 * `startedAt` and flipped the hunch to "running" the moment the workflow
 * returned, so the clock began before the user had read a single phase. Read the
 * plan in the evening and begin the next morning, and a baseline day was already
 * gone. This is the explicit action the "Start experiment" button now performs,
 * and it is the only place `startedAt` is ever written.
 *
 * `startOn: "tomorrow"` anchors the trial at the next UTC midnight. Nothing is
 * deferred or queued — `currentPhase` reports a future anchor as not-started, so
 * the trial simply has no loggable day until the date arrives.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: { protocol: true },
  });
  if (!hunch) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (!hunch.protocol) {
    return NextResponse.json(
      { error: "Design a plan for this hunch before starting it." },
      { status: 409 },
    );
  }
  if (hunch.protocol.safetyState !== "approved") {
    return NextResponse.json(
      { error: "This plan hasn't cleared its safety review." },
      { status: 409 },
    );
  }
  // Re-starting would silently move the anchor every logged day is measured
  // from, which is the same defect this route exists to fix.
  if (hunch.protocol.startedAt) {
    return NextResponse.json(
      { error: "This trial has already started." },
      { status: 409 },
    );
  }

  const parsed = startInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose whether to start today or tomorrow." },
      { status: 400 },
    );
  }

  const startedAt = startDateFor(parsed.data.startOn);

  // One transaction: a hunch is never "running" without an anchor, and never
  // anchored without being "running".
  await db.$transaction([
    db.protocol.update({ where: { hunchId: hunch.id }, data: { startedAt } }),
    db.hunch.update({ where: { id: hunch.id }, data: { status: "running" } }),
  ]);

  return NextResponse.json({ startedAt, status: "running" }, { status: 200 });
}
