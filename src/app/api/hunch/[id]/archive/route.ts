import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * File a finished experiment away, or bring it back.
 *
 * Home used to grow forever: every verdict the user had ever read stayed on the
 * screen underneath the one they were still logging. Archiving keeps the whole
 * record — verdict, plan, every check-in — and only takes it out of the way.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { archived?: unknown } | null;
  if (typeof body?.archived !== "boolean") {
    return NextResponse.json(
      { error: "Say whether to archive or restore." },
      { status: 400 },
    );
  }
  const archived = body.archived;

  const { id } = await params;
  // Scoped to the owner: updateMany rather than update, so another user's id
  // reports "not found" instead of throwing on a row they can't see. Archiving
  // also refuses a running trial — the screen only offers it on a finished
  // experiment, but a direct call could otherwise file away the one hunch the
  // user is still logging, and it would vanish from home mid-trial.
  const { count } = await db.hunch.updateMany({
    where: {
      id,
      userId: session.user.id,
      ...(archived ? { status: { not: "running" } } : {}),
    },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (count === 0) {
    // Nothing moved: either the hunch isn't theirs, or the guard above held.
    const exists = await db.hunch.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    return exists
      ? NextResponse.json(
          { error: "Finish or abandon this experiment before filing it away." },
          { status: 409 },
        )
      : NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  return NextResponse.json({ id, archived });
}
