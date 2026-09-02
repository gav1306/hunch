import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recallPriors } from "@/lib/memory/recall";
import { draftsFromSharpened, toParameterDto } from "@/lib/parameters";
import { sharpenRequestSchema } from "@/lib/schemas/clarify";
import { getSession } from "@/lib/session";
import { sharpenHunch } from "@/mastra/agents/hypothesis-coach";

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

  try {
    const priors = await recallPriors(session.user.id, parsed.data.rawText);
    const sharpened = await sharpenHunch(parsed.data.rawText, priors, parsed.data.answers);
    const drafts = draftsFromSharpened(sharpened);
    const hypothesisData = {
      statement: sharpened.statement,
      outcomeMetric: sharpened.outcomeMetric,
      outcomeType: sharpened.outcomeType,
      // Re-sharpening rewrites the statement, so the prediction that goes with
      // it is rewritten too. Null when the Coach didn't give one, rather than
      // leaving the previous statement's direction attached to a new claim.
      expectedDirection: sharpened.expectedDirection ?? null,
      confounders: sharpened.confounders,
    };

    const updated = await db.$transaction(async (tx) => {
      // The proposed set belongs to the old hypothesis; a new one proposes its
      // own. Nothing is logged yet, so nothing hangs off these rows.
      await tx.parameter.deleteMany({ where: { hunchId: hunch.id } });
      // A protocol designed for the old statement no longer describes this hunch.
      await tx.protocol.deleteMany({ where: { hunchId: hunch.id } });

      return tx.hunch.update({
        where: { id: hunch.id },
        data: {
          rawText: parsed.data.rawText,
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
              sortOrder: i,
            })),
          },
        },
        include: { hypothesis: true, parameters: { orderBy: { sortOrder: "asc" } } },
      });
    });

    return NextResponse.json(
      { hunch: { ...updated, parameters: updated.parameters.map(toParameterDto) }, priors },
      { status: 200 },
    );
  } catch (err) {
    console.error("[hunch] re-sharpen failed:", err);
    return NextResponse.json(
      { error: "Couldn't sharpen your hunch right now. Please try again in a moment." },
      { status: 502 },
    );
  }
}
