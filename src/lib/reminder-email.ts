/**
 * The daily reminder, as words.
 *
 * Kept apart from the sweep that sends it so the copy can be read and tested
 * without a database or a scheduler. The whole point of the email is the one
 * line that says what today asks of you — a "don't forget to log" with no
 * instruction in it makes the user open the app to find out what they were
 * supposed to have been doing.
 */

export type ReminderHunch = {
  id: string;
  statement: string;
  /** Today's phase instruction, when the protocol carries one. */
  phaseAction: string | null;
  day: number;
  total: number;
};

export type ReminderMail = { subject: string; text: string };

export function buildReminder({
  name,
  hunches,
  appUrl,
  unsubscribeUrl,
}: {
  name: string;
  hunches: ReminderHunch[];
  appUrl: string;
  unsubscribeUrl: string;
}): ReminderMail {
  if (hunches.length === 0) {
    // A reminder with nothing to remind you of is a bug upstream, not an empty
    // email to be sent politely.
    throw new Error("buildReminder called with no hunches.");
  }

  const first = hunches[0];
  const subject =
    hunches.length === 1
      ? `Day ${first.day} of ${first.total} — time to log`
      : `${hunches.length} experiments to log today`;

  const blocks = hunches.map((h) => {
    const lines = [
      h.statement,
      `Day ${h.day} of ${h.total}.`,
      h.phaseAction ?? "Log today's reading.",
      `${appUrl}/hunch/${h.id}`,
    ];
    return lines.join("\n");
  });

  const greeting = name.trim() ? `${name.trim().split(" ")[0]},` : "Hi,";

  const text = [
    greeting,
    "",
    hunches.length === 1
      ? "Today's reading keeps the experiment honest — a gap is a day the verdict can't use."
      : `A couple of minutes covers all ${hunches.length}. A gap is a day the verdict can't use.`,
    "",
    blocks.join("\n\n"),
    "",
    "—",
    `Reminders can be turned off here: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject, text };
}
