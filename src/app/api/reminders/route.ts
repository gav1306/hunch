import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const bodySchema = z.object({
  /** 0-23 in the user's own zone, or null to turn reminders off. */
  reminderHour: z.number().int().min(0).max(23).nullable(),
  /** IANA zone, as the browser reports it. */
  timeZone: z.string().trim().min(1).max(64).optional(),
});

/** What the settings screen reads. */
export async function GET() {
  const session = await getSession(await headers());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { reminderHour: true, timeZone: true },
  });
  return NextResponse.json(user ?? { reminderHour: null, timeZone: "UTC" });
}

/**
 * Set the reminder hour, and the zone it is read in.
 *
 * The zone comes from the browser rather than a picker: the user picked "8pm",
 * and which 8pm that is isn't a question they should have to answer. It is
 * re-sent on every change so a user who moves gets reminded on the clock in
 * front of them.
 */
export async function PUT(request: Request) {
  const session = await getSession(await headers());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick an hour between 0 and 23." }, { status: 400 });
  }

  const { reminderHour, timeZone } = parsed.data;
  const zone = timeZone && isKnownZone(timeZone) ? timeZone : undefined;

  const user = await db.user.update({
    where: { id: session.user.id },
    data: {
      reminderHour,
      // Off here means the same as off from the email: nothing switches them
      // back on but the user.
      remindersOptOut: reminderHour === null,
      ...(zone ? { timeZone: zone } : {}),
      // Turning reminders on shouldn't be blocked by a send earlier today under
      // the old hour, and turning them off has nothing to guard.
      lastReminderOn: null,
    },
    select: { reminderHour: true, timeZone: true },
  });

  return NextResponse.json(user);
}

/** Does this runtime recognise the zone? Anything else is not worth storing. */
function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
