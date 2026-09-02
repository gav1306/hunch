import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { recallPriors } from "@/lib/memory/recall";
import { draftsFromSharpened, toParameterDto } from "@/lib/parameters";
import { sharpenRequestSchema } from "@/lib/schemas/clarify";
import { MEDICATION_REFUSAL, medicationIntent } from "@/lib/safety/medication";
import { NoStructuredOutput, sharpenHunch } from "@/mastra/agents/hypothesis-coach";
import { diaryFallback } from "@/lib/safety/diary-fallback";

/**
 * Core loop, step one: drop a hunch -> Hypothesis Coach sharpens it -> persist
 * the Hunch and its Hypothesis, then return the pair for the Hunch Card.
 */
export async function POST(request: Request) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = sharpenRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A hunch can't be empty." }, {
      status: 400,
    });
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

  try {
    const priors = await recallPriors(session.user.id, parsed.data.rawText);
    let sharpened;
    try {
      sharpened = await sharpenHunch(
        parsed.data.rawText,
        priors,
        parsed.data.answers,
        parsed.data.observeOnly,
      );
    } catch (err) {
      // A diary keeps its promise even when the coach won't answer. Asked about
      // coming off a statin the model returns prose rather than an object, and
      // failing here would put the dead end back one step later — after the user
      // had already been told the app would keep the record.
      if (!(parsed.data.observeOnly && err instanceof NoStructuredOutput)) throw err;
      sharpened = diaryFallback(parsed.data.rawText);
    }

    const drafts = draftsFromSharpened(sharpened);

    const hunch = await db.hunch.create({
      data: {
        userId: session.user.id,
        rawText: parsed.data.rawText,
        status: "sharpened",
        hypothesis: {
          create: {
            statement: sharpened.statement,
            outcomeMetric: sharpened.outcomeMetric,
            expectedDirection: sharpened.expectedDirection ?? null,
            outcomeType: sharpened.outcomeType,
            confounders: sharpened.confounders,
          },
        },
        // The proposed set the confirm gate edits. Persisted now so a reload
        // of the protocol page still shows the trackers the Coach suggested.
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

    return NextResponse.json(
      { hunch: { ...hunch, parameters: hunch.parameters.map(toParameterDto) }, priors },
      { status: 201 },
    );
  } catch (err) {
    // The Coach (LLM) or the DB write failed. Always answer with JSON so the
    // client shows a graceful message instead of choking on an empty body.
    console.error("[hunch] sharpen failed:", err);
    return NextResponse.json(
      { error: "Couldn't sharpen your hunch right now. Please try again in a moment." },
      { status: 502 },
    );
  }
}
