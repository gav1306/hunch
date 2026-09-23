import "server-only";

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { concludeTrial, VERDICT_INCLUDE } from "@/lib/conclude-trial";
import { currentPhase } from "@/lib/schedule";
import { parseStoredDesign, type ProtocolDesign } from "@/lib/schemas/protocol";
import { localToday } from "@/lib/zone";

/**
 * Freeze verdicts before anyone asks for them.
 *
 * The first view of a finished trial used to wait ~4s on the Analyst. This
 * does that work overnight instead — but only once a full day has passed since
 * the schedule ended, in the user's own zone. Freezing a verdict makes the
 * hunch `concluded`, and a concluded hunch refuses check-ins, so concluding the
 * moment the schedule ends would take away filling in the last day the morning
 * after. A user who opens the hunch inside that grace day still gets the
 * inline compute, exactly as before.
 */

/** The schedule had already ended by yesterday, in the user's zone. */
export function isDueForVerdict(
  startedAt: Date,
  design: ProtocolDesign,
  timeZone: string,
  now: Date,
): boolean {
  const yesterday = new Date(localToday(timeZone, now).getTime() - 86_400_000);
  return currentPhase(startedAt, design, yesterday).done;
}

/** The slice of Inngest's `step` the sweep uses — narrow so tests can pass a fake. */
export type SweepStep = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };

export async function runVerdictSweep(
  step: SweepStep,
  now: Date = new Date(),
): Promise<{ due: number; concluded: number; failed: number }> {
  const due = await step.run("find-due", async () => {
    const hunches = await db.hunch.findMany({
      where: {
        status: "running",
        archivedAt: null,
        verdict: null,
        protocol: { startedAt: { not: null }, safetyState: { not: "observe-only" } },
      },
      select: {
        id: true,
        userId: true,
        hypothesis: { select: { outcomeMetric: true } },
        protocol: { select: { startedAt: true, design: true } },
      },
    });
    const zones = new Map(
      (
        await db.user.findMany({
          where: { id: { in: [...new Set(hunches.map((h) => h.userId))] } },
          select: { id: true, timeZone: true },
        })
      ).map((u) => [u.id, u.timeZone]),
    );
    return hunches
      .filter((h) => {
        if (!h.protocol?.startedAt) return false;
        try {
          const design = parseStoredDesign(h.protocol.design, h.hypothesis?.outcomeMetric);
          return isDueForVerdict(h.protocol.startedAt, design, zones.get(h.userId) ?? "UTC", now);
        } catch (err) {
          // A malformed design shouldn't fail the sweep for every other user's
          // hunch — leave it for a human to fix and move on.
          console.error("[verdict-sweep] skipping hunch", h.id, err);
          return false;
        }
      })
      .map((h) => ({ id: h.id, timeZone: zones.get(h.userId) ?? "UTC" }));
  });

  let concluded = 0;
  let failed = 0;
  for (const { id, timeZone } of due) {
    try {
      const outcome = await step.run(`conclude-${id}`, async () => {
        // Re-read: between the sweep and this step the user may have opened the
        // verdict (which freezes it) or archived the hunch.
        const hunch = await db.hunch.findUnique({ where: { id }, include: VERDICT_INCLUDE });
        if (!hunch || hunch.verdict || hunch.status !== "running" || hunch.archivedAt) {
          return "skipped" as const;
        }
        const result = await concludeTrial(hunch, hunch.userId, localToday(timeZone, now));
        if (!result.ok) {
          // 409s are `concludeTrial`'s deterministic refusals (not started,
          // still running, a diary) — nothing a retry, tonight or any other
          // night, would change.
          if (result.status === 409) return "skipped" as const;
          // Throwing makes Inngest retry this step alone.
          throw new Error(`conclude ${id}: ${result.status} ${result.error}`);
        }
        return "concluded" as const;
      });
      if (outcome === "concluded") concluded++;
    } catch (err) {
      // Out of retries. Tomorrow's sweep tries again, and a first view still
      // computes inline in the meantime.
      console.error("[verdict-sweep] conclude failed", id, err);
      failed++;
    }
  }

  return { due: due.length, concluded, failed };
}

export const verdictSweep = inngest.createFunction(
  {
    id: "verdict-sweep",
    name: "Freeze the verdicts of finished trials",
    retries: 2,
    triggers: [{ cron: "15 0 * * *" }],
  },
  async ({ step }) => runVerdictSweep(step as unknown as SweepStep),
);
