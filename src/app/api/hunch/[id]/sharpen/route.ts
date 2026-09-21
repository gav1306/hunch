import { headers } from "next/headers";
import { NextResponse, after } from "next/server";
import { untimed } from "@/lib/timing";
import { db } from "@/lib/db";
import { recallPriors } from "@/lib/memory/recall";
import { draftsFromSharpened, toParameterDto } from "@/lib/parameters";
import { sharpenRequestSchema } from "@/lib/schemas/clarify";
import { MEDICATION_REFUSAL, medicationIntent } from "@/lib/safety/medication";
import { getSession } from "@/lib/session";
import { sharpenHunch, streamSharpenHunch } from "@/mastra/agents/hypothesis-coach";
import { predesign } from "@/lib/design-draft/predesign";
import { SHARPEN_ERROR, sharpenStreamResponse } from "@/lib/hunch-stream";
import type { SharpenedHypothesis } from "@/lib/schemas/hypothesis";
import type { Prior } from "@/lib/schemas/prior";

/**
 * Re-sharpen a hunch the user already dropped, in place.
 *
 * The "redo" control on the confirm gate used to be a link to a blank
 * /hunch/new. That threw away the raw text, the clarifying answers and the
 * sharpened statement, and left the original hunch stranded in "Finish setting
 * up" with no way to reach or remove it. Same hunch id, new hypothesis.
 *
 * Refuses once the trial is under way: the hypothesis is what the logged days
 * are evidence about, so replacing it would silently re-label existing data.
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
    include: { protocol: true, _count: { select: { checkIns: true } } },
  });
  if (!hunch) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (hunch._count.checkIns > 0 || hunch.protocol?.startedAt) {
    return NextResponse.json(
      {
        error:
          "This trial is already under way — re-sharpening would change what your logged days mean.",
      },
      { status: 409 },
    );
  }

  const parsed = sharpenRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A hunch can't be empty." }, { status: 400 });
  }

  // Deterministic and first: a refusal here costs no tokens and reaches the user
  // before they have invested anything in a plan. `observeOnly` means they have
  // already read it and chosen the log instead, and that path schedules nothing.
  if (!parsed.data.observeOnly && medicationIntent(parsed.data.rawText)) {
    return NextResponse.json(
      { blocked: "medication", error: MEDICATION_REFUSAL },
      { status: 422 },
    );
  }

  const { rawText, answers, priorIds, observeOnly } = parsed.data;

  /** Rewrite this hunch's hypothesis, its parameters and its design draft. */
  async function persist(sharpened: SharpenedHypothesis, priors: Prior[]) {
    const drafts = draftsFromSharpened(sharpened);
    const hypothesisData = {
      statement: sharpened.statement,
      outcomeMetric: sharpened.outcomeMetric,
      outcomeType: sharpened.outcomeType,
      // Re-sharpening rewrites the statement, so the prediction that goes with
      // it is rewritten too. Null when the Coach didn't give one, rather than
      // leaving the previous statement's direction attached to a new claim.
      expectedDirection: sharpened.expectedDirection ?? null,
      subject: sharpened.subject,
      confounders: sharpened.confounders,
      schedulable: sharpened.schedulable,
    };

    const updated = await db.$transaction(async (tx) => {
      // The proposed set belongs to the old hypothesis; a new one proposes its
      // own. Nothing is logged yet, so nothing hangs off these rows.
      await tx.parameter.deleteMany({ where: { hunchId: hunch!.id } });
      // A protocol designed for the old statement no longer describes this hunch.
      await tx.protocol.deleteMany({ where: { hunchId: hunch!.id } });

      return tx.hunch.update({
        where: { id: hunch!.id },
        data: {
          rawText,
          status: "sharpened",
          hypothesis: {
            upsert: { create: hypothesisData, update: hypothesisData },
          },
          parameters: {
            create: drafts.map((d, i) => ({
              label: d.label,
              type: d.type,
              unit: d.unit ?? null,
              min: d.min ?? null,
              max: d.max ?? null,
              isPrimary: d.isPrimary,
              isExposure: d.isExposure ?? false,
              sortOrder: i,
            })),
          },
        },
        include: { hypothesis: true, parameters: { orderBy: { sortOrder: "asc" } } },
      });
    });

    // The old draft was designed from the old hypothesis; this one replaces it.
    // See the note in `src/app/api/hunch/route.ts` on scheduling from inside a
    // streaming body.
    if (!observeOnly) {
      try {
        after(() => untimed(() => predesign(updated.id)));
      } catch (err) {
        console.warn("[re-sharpen] after() unavailable, pre-designing detached:", err);
        void untimed(() => predesign(updated.id)).catch(() => {});
      }
    }

    return { hunch: { ...updated, parameters: updated.parameters.map(toParameterDto) }, priors };
  }

  // A log stays on JSON, for the same reason it does on the create route.
  if (observeOnly) {
    try {
      const priors = await recallPriors(session.user.id, rawText, priorIds);
      const sharpened = await sharpenHunch(rawText, priors, answers, true);
      return NextResponse.json(await persist(sharpened, priors), { status: 200 });
    } catch (err) {
      console.error("[hunch] re-sharpen failed:", err);
      return NextResponse.json({ error: SHARPEN_ERROR }, { status: 502 });
    }
  }

  return sharpenStreamResponse(
    async (emit) => {
      const priors = await recallPriors(session.user.id, rawText, priorIds);
      const sharpened = await streamSharpenHunch(rawText, priors, answers, false, emit);
      return persist(sharpened, priors);
    },
    { label: "re-sharpen" },
  );
}
