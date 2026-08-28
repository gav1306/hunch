import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { startDateFor } from "@/lib/schedule";

const startInputSchema = z.object({
  startOn: z.enum(["today", "tomorrow"]).default("today"),
  /** The browser's IANA zone, so reminders land at the user's own evening. */
  timeZone: z.string().trim().min(1).max(64).optional(),
});

/** The hour a first trial switches reminders on at, in the user's own zone. */
const DEFAULT_REMINDER_HOUR = 20;

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

  // Starting a trial is agreeing to log every day for a fortnight or more, so
  // it is also where daily reminders switch on — at 8pm in the user's own zone,
  // changeable in security, with an unsubscribe in every email. Never for a
  // user who has turned them off: `remindersOptOut` is the difference between
  // "hasn't been asked" and "said no".
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { reminderHour: true, remindersOptOut: true },
  });
  const zone = parsed.data.timeZone;
  const switchOnReminders = user !== null && user.reminderHour === null && !user.remindersOptOut;

  // One transaction: a hunch is never "running" without an anchor, and never
  // anchored without being "running".
  await db.$transaction([
    db.protocol.update({ where: { hunchId: hunch.id }, data: { startedAt } }),
    db.hunch.update({ where: { id: hunch.id }, data: { status: "running" } }),
    db.user.update({
      where: { id: session.user.id },
      data: {
        ...(switchOnReminders ? { reminderHour: DEFAULT_REMINDER_HOUR } : {}),
        // The zone is worth recording either way — it is how the app knows
        // which midnight a logged day belongs to.
        ...(zone && isKnownZone(zone) ? { timeZone: zone } : {}),
      },
    }),
  ]);

  return NextResponse.json(
    {
      startedAt,
      status: "running",
      remindersOn: switchOnReminders ? DEFAULT_REMINDER_HOUR : (user?.reminderHour ?? null),
    },
    { status: 200 },
  );
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
