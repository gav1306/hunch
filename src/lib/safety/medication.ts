/**
 * Does this hunch read as a proposal to vary prescribed medication?
 *
 * Pure string work, deliberately. It runs before the Coach, so a refusal costs
 * no tokens and reaches the user before they have spent three minutes designing
 * a plan the app was always going to turn down.
 *
 * **This is a guardrail, not a lock.** It matches phrasing, not intent, and
 * someone determined can word around it. The Safety Reviewer is the second
 * layer, for what phrasing hides. A `false` here is not evidence of safety.
 *
 * The shape it looks for is a VARIATION verb near a MEDICINE noun, and neither
 * half counts alone. "I skip breakfast" is not medical; "I take my statin" is
 * someone following their prescription — which is exactly the hunch observe-only
 * exists to keep rather than refuse.
 */
const VARIATION = [
  "stop taking",
  "stopping",
  "quit taking",
  "come off",
  "coming off",
  "go off",
  "going off",
  "off my",
  "skip my",
  "skipping my",
  "without my",
  "half dose",
  "halve",
  "cutting my dose",
  "cut my dose",
  "lower my dose",
  "reduce my dose",
  "double my dose",
  "every other day",
];

const MEDICINE = [
  "med",
  "meds",
  "medication",
  "medicine",
  "pill",
  "tablet",
  "dose",
  "prescription",
  "prescribed",
  "antidepressant",
  "statin",
  "metformin",
  "insulin",
  "sertraline",
  "thyroid",
  "blood pressure pill",
  "bp med",
];

/** Lower-case, drop punctuation that would split a phrase, collapse spaces. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function medicationIntent(rawText: string): boolean {
  const text = normalise(rawText);
  if (!text) return false;

  const varies = VARIATION.some((phrase) => text.includes(normalise(phrase)));
  if (!varies) return false;

  // Word boundaries, so "medical" is not "med" — and an optional trailing s, so
  // one list entry covers "pill" and "pills".
  return MEDICINE.some((word) => new RegExp(`\\b${normalise(word)}s?\\b`).test(text));
}

/**
 * What the user reads.
 *
 * It names the reason once and does not repeat it: no warning triangle, no
 * paragraph about safety. The person asking this has usually noticed something
 * real and wants to know whether it is real, and the message must not read as
 * an accusation. It ends on what the app *will* do, because a refusal with no
 * door is why people leave.
 */
export const MEDICATION_REFUSAL =
  "Hunch can't plan a trial that changes your medication. Starting, stopping or " +
  "adjusting a prescribed drug is a decision for you and your doctor. What it can " +
  "do is keep the record: log how you feel each day while you take it exactly as " +
  "prescribed, and if your doctor does change something, the log is already running.";
