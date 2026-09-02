import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { observeOnlyDesign } from "@/lib/schemas/protocol";

/**
 * Turn a hunch into a log the app keeps rather than a trial it schedules.
 *
 * This is where a refusal leads. A hunch the app won't design — because it
 * proposes varying prescribed medication, or because the Safety Reviewer turned
 * the design down — is still a real thing the person noticed, and a dead end is
 * why people leave. Observe-only keeps it alive with the intervention removed:
 * change nothing, log daily, keep the record.
 *
 * No agent runs here. There is nothing to design and nothing to review: the
 * protocol says change nothing, so there is no change to be unsafe.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: { hypothesis: true, protocol: true },
  });
  if (!hunch) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (!hunch.hypothesis) {
    return NextResponse.json(
      { error: "Sharpen this hunch first — there's nothing to log yet." },
      { status: 409 },
    );
  }
  // A running trial keeps its phases. Swapping them for a single arm underneath
  // logged days would leave every one of those days labelled against a phase
  // that no longer exists.
  if (hunch.protocol?.startedAt) {
    return NextResponse.json(
      { error: "This trial has already started." },
      { status: 409 },
    );
  }

  const protocolData = {
    design: observeOnlyDesign(hunch.hypothesis.outcomeMetric),
    powerInfo: undefined,
    confounders: undefined,
    safetyState: "observe-only",
  };

  // No startedAt, deliberately — the user starts it, the same as any other plan.
  const protocol = await db.protocol.upsert({
    where: { hunchId: hunch.id },
    create: { hunchId: hunch.id, ...protocolData },
    update: protocolData,
  });

  return NextResponse.json({ protocol }, { status: 201 });
}
