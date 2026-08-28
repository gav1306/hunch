import "server-only";

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { totalDays } from "@/lib/adherence";
import { buildReminder, type ReminderHunch } from "@/lib/reminder-email";
import { isReminderDue, localDateIn, signUnsubscribe } from "@/lib/reminders";
import { currentPhase } from "@/lib/schedule";
import { parseStoredDesign } from "@/lib/schemas/protocol";

/** Where the links in the email point. */
function appUrl(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

/**
 * The hourly sweep.
 *
 * Runs every hour because "8pm" means something different in every timezone,
 * and picking the users whose local 8pm has just arrived is cheaper than
 * scheduling a job per user per day. It only fans out: one event per user who
 * is actually due, so a failing send retries on its own without dragging the
 * other users' reminders back through the queue with it.
 */
export const reminderSweep = inngest.createFunction(
  {
    id: "reminder-sweep",
    name: "Sweep for due reminders",
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const at = new Date();

    const due = await step.run("find-due-users", async () => {
      const users = await db.user.findMany({
        where: { reminderHour: { not: null } },
        select: { id: true, timeZone: true, reminderHour: true, lastReminderOn: true },
      });
      return users
        .filter((u) => isReminderDue(u, at))
        .map((u) => ({ userId: u.id }));
    });

    if (due.length === 0) return { sent: 0 };

    await step.sendEvent(
      "fan-out",
      due.map((d) => ({ name: "reminder/due", data: d })),
    );

    return { due: due.length };
  },
);

/**
 * One user's reminder.
 *
 * Everything it needs to decide is re-read here rather than carried on the
 * event: between the sweep and this step the user may have logged, turned
 * reminders off, or finished the trial, and an email that arrives after the
 * fact is worse than no email.
 */
export const sendReminder = inngest.createFunction(
  {
    id: "send-reminder",
    name: "Send one daily reminder",
    retries: 3,
    triggers: [{ event: "reminder/due" }],
  },
  async ({ event, step }) => {
    const userId = event.data.userId as string;
    const at = new Date();

    const plan = await step.run("gather", async () => {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          timeZone: true,
          reminderHour: true,
          lastReminderOn: true,
        },
      });
      if (!user || !isReminderDue(user, at)) return null;

      const today = localDateIn(user.timeZone, at);
      const hunches = await db.hunch.findMany({
        where: { userId, status: "running", protocol: { startedAt: { not: null } } },
        include: {
          hypothesis: { select: { statement: true, outcomeMetric: true } },
          protocol: { select: { design: true, startedAt: true } },
          checkIns: { where: { loggedOn: today }, select: { id: true } },
        },
      });

      const pending: ReminderHunch[] = [];
      for (const h of hunches) {
        if (!h.protocol?.startedAt || !h.hypothesis) continue;
        if (h.checkIns.length > 0) continue; // already logged today

        const design = parseStoredDesign(h.protocol.design, h.hypothesis.outcomeMetric);
        const status = currentPhase(h.protocol.startedAt, design, today);
        // Nothing to ask for on a rest day, before day 1, or after the end.
        if (!status.started || status.done || status.washout || status.phase === null) {
          continue;
        }

        pending.push({
          id: h.id,
          statement: h.hypothesis.statement,
          phaseAction:
            status.phaseIndex === null
              ? null
              : (design.phases[status.phaseIndex]?.action ?? null),
          day:
            Math.round((today.getTime() - h.protocol.startedAt.getTime()) / 86_400_000) + 1,
          total: totalDays(design),
        });
      }

      return { user, today, pending };
    });

    if (!plan || plan.pending.length === 0) return { sent: 0, reason: "nothing to log" };

    await step.run("send", async () => {
      const mail = buildReminder({
        name: plan.user.name,
        hunches: plan.pending,
        appUrl: appUrl(),
        unsubscribeUrl: `${appUrl()}/api/reminders/unsubscribe?u=${encodeURIComponent(
          plan.user.id,
        )}&t=${signUnsubscribe(plan.user.id)}`,
      });
      await sendEmail({ to: plan.user.email, subject: mail.subject, text: mail.text });
    });

    // Written after the send, so a failure retries into another attempt rather
    // than marking the day done and going quiet.
    await step.run("mark-sent", async () => {
      // `plan` crossed a step boundary, so its Date came back as an ISO string.
      await db.user.update({
        where: { id: plan.user.id },
        data: { lastReminderOn: new Date(plan.today) },
      });
    });

    return { sent: 1, hunches: plan.pending.length };
  },
);

export const functions = [reminderSweep, sendReminder];
