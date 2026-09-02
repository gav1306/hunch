import "server-only";

import { db } from "@/lib/db";
import { engineOutcomeType, pickPrimary } from "@/lib/parameters";
import { currentPhase, utcDaysBetween } from "@/lib/schedule";
import type { ParameterType } from "@/lib/schemas/parameter";
import { canRun, parseStoredDesign } from "@/lib/schemas/protocol";

export type HomeHunch = {
  id: string;
  rawText: string;
  statement: string;
  status: string;
  outcomeType: "binary" | "continuous";
  /** What the home quick-log writes to. Null before the hunch is sharpened. */
  primaryParameter: {
    id: string;
    label: string;
    type: ParameterType;
    min: number | null;
    max: number | null;
  } | null;
  phaseLabel: "baseline" | "intervention" | null;
  /**
   * How far setting this hunch up has got, for the "Finish setting up" cards.
   * `ready-to-start` only became reachable once designing stopped starting the
   * trial: a hunch can now hold a finished plan it has not begun.
   */
  setupStage: "needs-sharpening" | "needs-plan" | "ready-to-start" | null;
  /** Set only while a started trial is still waiting for its first day. */
  startsOn: string | null;
  /** Null until the trial actually begins — a scheduled trial is not on day 1. */
  progress: { day: number; total: number } | null;
  loggableToday: boolean;
  loggedToday: boolean;
  verdict: {
    category: string;
    effect: number;
    pEffect: number;
    /** The user's own prediction, for the badge. Null on older hypotheses. */
    expectedDirection: "up" | "down" | null;
  } | null;
  /** Null while the hunch is live. ISO string once the user files it away. */
  archivedOn: string | null;
};

export type HomeData = {
  hasAny: boolean;
  today: HomeHunch[];
  running: HomeHunch[];
  needsSetup: HomeHunch[];
  verdicts: HomeHunch[];
  /** Filed away: still whole, just not competing for the screen. */
  archived: HomeHunch[];
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
      parameters: true,
      checkIns: { where: { loggedOn: today }, select: { id: true } },
    },
  });

  const mapped: HomeHunch[] = hunches.map((h) => {
    let progress: HomeHunch["progress"] = null;
    let phaseLabel: HomeHunch["phaseLabel"] = null;
    let loggableToday = false;
    let startsOn: string | null = null;
    const primary = pickPrimary(h.parameters);

    if (h.protocol?.startedAt) {
      try {
        const design = parseStoredDesign(h.protocol.design);
        const ph = currentPhase(h.protocol.startedAt, design, now);

        if (ph.started) {
          const total =
            design.phases.reduce((s, p) => s + p.days, 0) +
            design.washoutDays * Math.max(0, design.phases.length - 1);
          const day = Math.min(
            total,
            Math.max(1, utcDaysBetween(h.protocol.startedAt, now) + 1),
          );
          progress = { day, total };
        } else {
          // Started "tomorrow": anchored, but no day has run. Reporting day 1 of
          // N here would claim a day the user has not lived yet.
          startsOn = h.protocol.startedAt.toISOString();
        }

        phaseLabel = ph.kind;
        loggableToday =
          h.status === "running" &&
          canRun(h.protocol.safetyState) &&
          ph.started &&
          !ph.done &&
          !ph.washout &&
          ph.phase !== null;
      } catch {
        // malformed design — treat as not loggable
      }
    }

    // What the "Finish setting up" card should offer. A designed-but-unstarted
    // hunch is not "needs a plan": it has one, and needs a start.
    let setupStage: HomeHunch["setupStage"] = null;
    if (!h.verdict) {
      if (h.status === "draft" || !h.hypothesis) {
        setupStage = "needs-sharpening";
      } else if (h.status === "sharpened") {
        setupStage =
          h.protocol && canRun(h.protocol.safetyState)
            ? "ready-to-start"
            : "needs-plan";
      }
    }

    return {
      id: h.id,
      rawText: h.rawText,
      statement: h.hypothesis?.statement ?? h.rawText,
      status: h.status,
      outcomeType: engineOutcomeType(h.hypothesis?.outcomeType),
      primaryParameter: primary
        ? {
            id: primary.id,
            label: primary.label,
            type: primary.type as ParameterType,
            min: primary.min,
            max: primary.max,
          }
        : null,
      phaseLabel,
      setupStage,
      startsOn,
      progress,
      loggableToday,
      loggedToday: h.checkIns.length > 0,
      verdict: h.verdict
        ? {
            category: h.verdict.category,
            effect: h.verdict.effect,
            pEffect: h.verdict.pEffect,
            expectedDirection:
              (h.hypothesis?.expectedDirection as "up" | "down" | null) ?? null,
          }
        : null,
      archivedOn: h.archivedAt ? h.archivedAt.toISOString() : null,
    };
  });

  const isToday = (h: HomeHunch) => h.loggableToday && !h.loggedToday;
  // Archived hunches are held out of every working group before anything else
  // is decided, so a filed-away experiment can't reappear as "check in today".
  const live = mapped.filter((h) => h.archivedOn === null);

  return {
    hasAny: mapped.length > 0,
    today: live.filter(isToday),
    // In-flight roster excludes what's already actionable under Today, so a
    // not-yet-logged experiment isn't shown twice on the same screen.
    running: live.filter((h) => h.status === "running" && !isToday(h)),
    needsSetup: live.filter(
      (h) => !h.verdict && (h.status === "sharpened" || h.status === "draft"),
    ),
    verdicts: live.filter((h) => h.verdict),
    archived: mapped.filter((h) => h.archivedOn !== null),
  };
}
