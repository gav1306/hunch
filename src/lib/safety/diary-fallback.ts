import type { SharpenedHypothesis } from "@/lib/schemas/hypothesis";

/**
 * A hypothesis for a diary, built without the model.
 *
 * The Coach sometimes declines to answer at all when the raw text is
 * medication-adjacent — asked about coming off a statin it returns prose, not
 * an object, and the app was left showing "couldn't sharpen your hunch right
 * now". That is the dead end observe-only exists to remove, reappearing one
 * step later.
 *
 * A diary needs far less than a trial does: something to log each day, and a
 * sentence naming what the person is watching. Neither needs a model. The
 * user's own words become the statement, unedited — this path never claims to
 * have sharpened anything.
 */
export function diaryFallback(rawText: string): SharpenedHypothesis {
  return {
    statement: rawText.trim(),
    outcomeMetric: "how you felt overall, rated 1-5",
    outcomeType: "continuous",
    // A diary is about the person keeping it.
    subject: "self",
    confounders: [],
    trackers: [],
  };
}
