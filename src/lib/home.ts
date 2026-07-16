import "server-only";

import { db } from "@/lib/db";
import { currentPhase } from "@/lib/schedule";
import { protocolDesignSchema } from "@/lib/schemas/protocol";

/** Whole UTC calendar days from `from` to `to` (date-only). */
function utcDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

export type HomeHunch = {
  id: string;
  rawText: string;
  statement: string;
  status: string;
  outcomeType: "binary" | "continuous";
  phaseLabel: "baseline" | "intervention" | null;
  progress: { day: number; total: number } | null;
  loggableToday: boolean;
  loggedToday: boolean;
  verdict: { category: string; effect: number; pEffect: number } | null;
};

export type HomeData = {
  hasAny: boolean;
  today: HomeHunch[];
  running: HomeHunch[];
  needsSetup: HomeHunch[];
  verdicts: HomeHunch[];
};

/**
 * Everything the authed home needs: the user's hunches, grouped by what the
 * user should do with each — check in today, keep an eye on it, finish setting
 * it up, or read the verdict.
 */
export async function getHomeData(userId: string): Promise<HomeData> {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const hunches = await db.hunch.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      hypothesis: true,
      protocol: true,
      verdict: true,
      checkIns: { where: { loggedOn: today }, select: { id: true } },
    },
  });

  const mapped: HomeHunch[] = hunches.map((h) => {
    let progress: HomeHunch["progress"] = null;
    let phaseLabel: HomeHunch["phaseLabel"] = null;
    let loggableToday = false;

    if (h.protocol?.startedAt) {
      try {
        const design = protocolDesignSchema.parse(h.protocol.design);
        const total =
          design.phases.reduce((s, p) => s + p.days, 0) +
          design.washoutDays * Math.max(0, design.phases.length - 1);
        const day = Math.min(
          total,
          Math.max(1, utcDaysBetween(h.protocol.startedAt, now) + 1),
        );
        progress = { day, total };

        const ph = currentPhase(h.protocol.startedAt, design, now);
        phaseLabel = ph.kind;
        loggableToday =
          h.status === "running" &&
          h.protocol.safetyState === "approved" &&
          ph.started &&
          !ph.done &&
          !ph.washout &&
          ph.phase !== null;
      } catch {
        // malformed design — treat as not loggable
      }
    }

    return {
      id: h.id,
      rawText: h.rawText,
      statement: h.hypothesis?.statement ?? h.rawText,
      status: h.status,
      outcomeType: (h.hypothesis?.outcomeType as "binary" | "continuous") ?? "binary",
      phaseLabel,
      progress,
      loggableToday,
      loggedToday: h.checkIns.length > 0,
      verdict: h.verdict
        ? {
            category: h.verdict.category,
            effect: h.verdict.effect,
            pEffect: h.verdict.pEffect,
          }
        : null,
    };
  });

  const isToday = (h: HomeHunch) => h.loggableToday && !h.loggedToday;

  return {
    hasAny: mapped.length > 0,
    today: mapped.filter(isToday),
    // In-flight roster excludes what's already actionable under Today, so a
    // not-yet-logged experiment isn't shown twice on the same screen.
    running: mapped.filter((h) => h.status === "running" && !isToday(h)),
    needsSetup: mapped.filter(
      (h) => !h.verdict && (h.status === "sharpened" || h.status === "draft"),
    ),
    verdicts: mapped.filter((h) => h.verdict),
  };
}
