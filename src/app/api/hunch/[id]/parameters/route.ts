import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { activeParameters, toParameterDto } from "@/lib/parameters";
import { MAX_ACTIVE_PARAMETERS, trackerAddSchema } from "@/lib/schemas/parameter";

/**
 * Add a tracker to a trial already under way.
 *
 * Adding is safe in a way redesigning is not. A new row starts empty, the days
 * before it are legitimately blank, and the engine reads only the primary — so
 * nothing about the verdict moves. What the design route refuses, and this one
 * keeps refusing, is touching the measure the verdict is built on.
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
    include: { protocol: true, parameters: true },
  });
  if (!hunch) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  // Before the clock starts, the plan is still editable in one place — the
  // confirm gate. Two doors onto the same set would only disagree.
  if (!hunch.protocol?.startedAt) {
    return NextResponse.json(
      { error: "This trial hasn't started — change the plan instead." },
      { status: 409 },
    );
  }

  const parsed = trackerAddSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Give it a name and say how you'll log it." },
      { status: 400 },
    );
  }

  const active = activeParameters(hunch.parameters);
  if (active.length >= MAX_ACTIVE_PARAMETERS) {
    return NextResponse.json(
      { error: "You're already tracking five things. Retire one first." },
      { status: 409 },
    );
  }

  const parameter = await db.parameter.create({
    data: {
      hunchId: hunch.id,
      label: parsed.data.label,
      type: parsed.data.type,
      unit: parsed.data.unit ?? null,
      min: parsed.data.min ?? null,
      max: parsed.data.max ?? null,
      // Never from the payload. A running trial has its primary and it is frozen
      // for the length of the trial.
      isPrimary: false,
      // Past the end of everything, retired rows included, so ordering stays
      // stable when a retired row is brought back.
      sortOrder: hunch.parameters.length,
    },
  });

  return NextResponse.json({ parameter: toParameterDto(parameter) }, { status: 201 });
}
