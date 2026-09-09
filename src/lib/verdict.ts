import type { Belief } from "@/lib/schemas/belief";
import type { PhaseStatus } from "@/lib/schedule";
import type { ExposureReport, VerdictCategory } from "@/lib/schemas/verdict";

/** Minimum check-ins per arm before a verdict is trustworthy (matches the Phase 4 warming-up floor). */
const MIN_PER_ARM = 3;

/**
 * Classify a concluded trial's belief into a verdict category. Pure and
 * deterministic — the LLM never decides this. Returns null while the schedule
 * is still running (or absent). A "clear" verdict requires the 95% credible
 * interval to exclude zero, exactly the rule the belief meter draws; a bound
 * touching zero counts as straddling.
 */
export function classifyVerdict(
  belief: Belief,
  schedule: PhaseStatus | null,
): VerdictCategory | null {
  if (!schedule || !schedule.done) return null;
  if (belief.nA < MIN_PER_ARM || belief.nB < MIN_PER_ARM) {
    return "inconclusive_insufficient";
  }
  const [low, high] = belief.ci;
  if (low > 0) return "helped";
  if (high < 0) return "hurt";
  return "inconclusive_no_effect";
}

/** The outcome a verdict is about — the primary parameter, as the UI knows it. */
export type VerdictOutcome = { label: string; unit?: string };

/**
 * A word is left alone when it is an acronym (BP, HR, VO2). Anything else is a
 * normal word whose case is ours to set: labels arrive both ways ("hours of
 * sleep" from the Coach, "Bugs found today" typed by the user), and a headline
 * that reads as a sentence has to fix that up at both ends.
 */
function isAcronym(word: string): boolean {
  return word.length > 1 && word.slice(0, 2) === word.slice(0, 2).toUpperCase();
}

function sentenceStart(label: string): string {
  const [first = ""] = label.split(" ");
  return isAcronym(first) ? label : label.charAt(0).toUpperCase() + label.slice(1);
}

function midSentence(label: string): string {
  const [first = ""] = label.split(" ");
  return isAcronym(first) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/** "Played basketball on 6 of 21 logged days." */
export function exposureSummary(e: ExposureReport): string {
  const days = e.exposed + e.unexposed + e.unknown;
  return `${sentenceStart(e.label)} on ${e.exposed} of ${days} logged days.`;
}

/** Named only when days fell out of the comparison. */
export function exposureDropped(e: ExposureReport): string | null {
  if (e.unknown === 0) return null;
  return e.unknown === 1
    ? "1 day had no answer either way, so it isn't in the comparison."
    : `${e.unknown} days had no answer either way, so they aren't in the comparison.`;
}

/**
 * The one thing an observational trial must say about itself. Exposure is
 * self-selected — people play on days their knee already feels good — so this
 * is a correlation and the copy says so in the user's own words, once.
 */
export function observationalCaveat(e: ExposureReport): string {
  return (
    `These are the days you logged ${midSentence(e.label)} compared with the days ` +
    `you didn't — you chose which were which, so this shows what went together, ` +
    `not what caused what.`
  );
}

/**
 * The verdict headline: which way the outcome moved, in the user's own words.
 *
 * Deliberately free of valence. `effect` is `meanB - meanA` on the raw outcome
 * (see src/lib/bayes), so the engine knows the direction a number moved and
 * nothing more — whether "up" is good depends on whether the outcome is hours
 * of sleep or bugs shipped, which is the user's judgement, not ours. Saying
 * "it helped" because a number rose is wrong for every hunch where less is
 * better, which is roughly half of them.
 *
 * The category names are the stored ones and still read as valence; they are
 * renamed to increase/decrease when the badge work lands.
 *
 * `exposure` is optional so the two-argument call sites (frozen exports,
 * belief payloads without an exposure) keep compiling untouched. It only
 * changes the thin-arm headline, and only when `exposure.observational` is
 * true: on an observational trial "not enough days" is false the moment the
 * user logged every day of the window — what was thin was the split between
 * exposed and unexposed, not the logging. On a phased trial a missing day
 * really is a missing day, so the generic headline stands.
 */
export function verdictHeadline(
  category: VerdictCategory,
  outcome: VerdictOutcome | null,
  exposure?: ExposureReport | null,
): string {
  switch (category) {
    case "inconclusive_insufficient":
      if (exposure?.observational) {
        return `Too few days either side of "${exposure.label}"`;
      }
      return "Not enough days to tell";
    case "inconclusive_no_effect":
      return outcome
        ? `No difference in ${midSentence(outcome.label)}`
        : "No difference either way";
    case "helped":
      return outcome ? `${sentenceStart(outcome.label)} went up` : "Your outcome went up";
    case "hurt":
      return outcome ? `${sentenceStart(outcome.label)} went down` : "Your outcome went down";
  }
}

/**
 * The scanning badge for a concluded trial, for a list where a sentence is too
 * long to read.
 *
 * With a recorded prediction it answers the only question a list needs: did the
 * hunch hold up? Without one — every hypothesis sharpened before the Coach
 * wrote `expectedDirection` — it falls back to the direction, which is always
 * knowable. Neither branch says whether the news was good.
 *
 * `Reversed` is deliberately its own word rather than folded into "Not
 * confirmed". A surprise reversal is the most interesting result an experiment
 * can produce, and a clean null is not the same finding at all.
 */
export function verdictBadge(
  category: VerdictCategory,
  expectedDirection: "up" | "down" | null | undefined,
): string {
  if (category === "inconclusive_insufficient") return "Not enough days";
  if (category === "inconclusive_no_effect") {
    return expectedDirection ? "Not confirmed" : "No difference";
  }
  const measured = category === "helped" ? "up" : "down";
  if (!expectedDirection) return measured === "up" ? "Increase" : "Decrease";
  return measured === expectedDirection ? "Confirmed" : "Reversed";
}
