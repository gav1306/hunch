import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * Run the same experiment again.
 *
 * The verdict used to be the end of the road, and the only way back to the same
 * test was to retype the hunch and sit through sharpening and design a second
 * time for a plan the user had already approved. This copies the hypothesis,
 * the design and the parameters into a fresh hunch that has never run: no
 * check-ins, no verdict, nothing started. The safety state comes across with it
 * — it is the same protocol, already reviewed — so the clone lands on its
 * protocol page ready to start rather than back at the beginning.
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
  const source = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: {
      hypothesis: true,
      protocol: true,
      parameters: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!source || !source.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (!source.protocol) {
    return NextResponse.json(
      { error: "This hunch has no plan to repeat." },
      { status: 409 },
    );
  }

  const { hypothesis, protocol } = source;
  const clone = await db.hunch.create({
    data: {
      userId: session.user.id,
      rawText: source.rawText,
      // Designed, not started: the repeat still passes through the protocol
      // page so the user picks when it begins.
      status: "sharpened",
      hypothesis: {
        create: {
          statement: hypothesis.statement,
          outcomeMetric: hypothesis.outcomeMetric,
          outcomeType: hypothesis.outcomeType,
          confounders: hypothesis.confounders,
        },
      },
      protocol: {
        create: {
          design: protocol.design as Prisma.InputJsonValue,
          ...(protocol.powerInfo !== null
            ? { powerInfo: protocol.powerInfo as Prisma.InputJsonValue }
            : {}),
          ...(protocol.confounders !== null
            ? { confounders: protocol.confounders as Prisma.InputJsonValue }
            : {}),
          safetyState: protocol.safetyState,
          startedAt: null,
        },
      },
      parameters: {
        create: source.parameters.map((p) => ({
          label: p.label,
          type: p.type,
          unit: p.unit,
          min: p.min,
          max: p.max,
          isPrimary: p.isPrimary,
          sortOrder: p.sortOrder,
        })),
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: clone.id }, { status: 201 });
}
