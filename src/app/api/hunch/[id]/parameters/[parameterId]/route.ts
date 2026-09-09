import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { toParameterDto } from "@/lib/parameters";
import { parseStoredDesign } from "@/lib/schemas/protocol";

const retireSchema = z.object({ retired: z.boolean() });

/**
 * Retire a tracker, or bring it back.
 *
 * PATCH and not DELETE, because nothing is deleted: `CheckInValue` cascades off
 * `Parameter`, so removing the row would take every reading of it with it and
 * the export would quietly lose a column it once had. Retirement stamps a date;
 * the check-in stops asking and the record keeps everything.
 *
 * The primary is refused outright. It is the measure the verdict is computed
 * from, and a trial that stops logging it has no result. The UI renders no
 * control for it, and this refuses the request anyway.
 *
 * The exposure is refused the same way, but only on an observational trial —
 * there it is the daily yes/no the arms are derived from, so losing it costs
 * the result. On a phased trial the schedule assigns the arms and the
 * exposure is only an adherence count, so it retires like any other tracker.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; parameterId: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, parameterId } = await params;
  const parsed = retireSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Say whether to retire it or bring it back." },
      { status: 400 },
    );
  }

  // Ownership is checked through the hunch, so a guessed parameter id on
  // someone else's trial is a 404 like any other miss.
  const parameter = await db.parameter.findFirst({
    where: { id: parameterId, hunchId: id, hunch: { userId: session.user.id } },
    include: { hunch: { include: { protocol: true } } },
  });
  if (!parameter) {
    return NextResponse.json(
      { error: "That isn't something this hunch tracks." },
      { status: 404 },
    );
  }
  if (parameter.isPrimary) {
    return NextResponse.json(
      { error: "This is the measure your result is built on — it has to keep running." },
      { status: 409 },
    );
  }
  // On an observational trial the exposure IS the arm assignment — retiring it
  // mid-trial leaves later days with no way to tell A from B. A hunch with no
  // protocol yet has no shape to speak of, so treat it as "phased" and let the
  // retirement through.
  if (parameter.isExposure && parsed.data.retired) {
    const shape = parameter.hunch.protocol
      ? parseStoredDesign(parameter.hunch.protocol.design).shape
      : "phased";
    if (shape === "observational") {
      return NextResponse.json(
        { error: "This is how we tell your days apart — it has to keep running." },
        { status: 409 },
      );
    }
  }

  const updated = await db.parameter.update({
    where: { id: parameter.id },
    data: { retiredAt: parsed.data.retired ? new Date() : null },
  });

  return NextResponse.json({ parameter: toParameterDto(updated) });
}
