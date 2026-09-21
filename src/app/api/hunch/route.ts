import { headers } from "next/headers";
import { NextResponse, after } from "next/server";
import { untimed, withTiming } from "@/lib/timing";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { recallPriors } from "@/lib/memory/recall";
import { draftsFromSharpened, toParameterDto } from "@/lib/parameters";
import { sharpenRequestSchema } from "@/lib/schemas/clarify";
import { MEDICATION_REFUSAL, medicationIntent } from "@/lib/safety/medication";
import {
  NoStructuredOutput,
  sharpenHunch,
  streamSharpenHunch,
} from "@/mastra/agents/hypothesis-coach";
import { diaryFallback } from "@/lib/safety/diary-fallback";
import { predesign } from "@/lib/design-draft/predesign";
import { SHARPEN_ERROR, sharpenStreamResponse } from "@/lib/hunch-stream";
import type { SharpenedHypothesis } from "@/lib/schemas/hypothesis";
import type { Prior } from "@/lib/schemas/prior";

/**
 * Core loop, step one: drop a hunch -> Hypothesis Coach sharpens it -> persist
 * the Hunch and its Hypothesis, then return the pair for the Hunch Card.
 */
async function createHunch(request: Request) {
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

  const { rawText, answers, priorIds, observeOnly } = parsed.data;

  /**
   * Persist the sharpened hunch with the parameter set the confirm gate will
   * edit, and build the body both roads out of here return.
   */
  async function persist(sharpened: SharpenedHypothesis, priors: Prior[]) {
    const drafts = draftsFromSharpened(sharpened);

    const hunch = await db.hunch.create({
      data: {
        userId: session!.user.id,
        rawText,
        status: "sharpened",
        hypothesis: {
          create: {
            statement: sharpened.statement,
            outcomeMetric: sharpened.outcomeMetric,
            expectedDirection: sharpened.expectedDirection ?? null,
            subject: sharpened.subject,
            outcomeType: sharpened.outcomeType,
            confounders: sharpened.confounders,
            schedulable: sharpened.schedulable,
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
            isExposure: d.isExposure ?? false,
            sortOrder: i,
          })),
        },
      },
      include: { hypothesis: true, parameters: { orderBy: { sortOrder: "asc" } } },
    });

    // Design the plan while the user reads the confirm gate; confirm takes it
    // if nothing it depends on changed. A log never gets a designed plan.
    // `after()` is still available from inside the streaming body — the request
    // is open until the stream closes — but a hunch that is already saved must
    // not fail over scheduling, so a refusal falls back to running it detached.
    if (!observeOnly) {
      try {
        after(() => untimed(() => predesign(hunch.id)));
      } catch (err) {
        // If this fallback is ever taken in production, the background
        // pre-design is running detached — which on some deploy targets means
        // not at all — and the confirm gate silently regresses to the long
        // inline design a previous change removed. Worth a log scan.
        console.error("[hunch] after() unavailable, pre-designing detached:", err);
        void untimed(() => predesign(hunch.id)).catch(() => {});
      }
    }

    return { hunch: { ...hunch, parameters: hunch.parameters.map(toParameterDto) }, priors };
  }

  // A log stays on JSON. It is the one path whose visible output can be thrown
  // away and replaced — the model returns prose, `sharpenHunch` throws, and
  // `diaryFallback` writes the hypothesis from the user's own words — so
  // streaming it would mean streaming text the app is about to discard.
  if (observeOnly) {
    try {
      const priors = await recallPriors(session.user.id, rawText, priorIds);
      let sharpened;
      try {
        sharpened = await sharpenHunch(rawText, priors, answers, true);
      } catch (err) {
        // A diary keeps its promise even when the coach won't answer. Asked
        // about coming off a statin the model returns prose rather than an
        // object, and failing here would put the dead end back one step later
        // — after the user had already been told the app would keep the record.
        if (!(err instanceof NoStructuredOutput)) throw err;
        sharpened = diaryFallback(rawText);
      }
      return NextResponse.json(await persist(sharpened, priors), { status: 201 });
    } catch (err) {
      console.error("[hunch] sharpen failed:", err);
      return NextResponse.json({ error: SHARPEN_ERROR }, { status: 502 });
    }
  }

  // Everything that can still refuse — auth, empty input, medication — has run
  // above, with a real status code. From here the answer is a stream: the
  // hypothesis types out while the Coach writes it, and a failure past the
  // first byte arrives as the stream's last line instead of a 502.
  return sharpenStreamResponse(
    async (emit) => {
      const priors = await recallPriors(session.user.id, rawText, priorIds);
      const sharpened = await streamSharpenHunch(rawText, priors, answers, false, emit);
      return persist(sharpened, priors);
    },
    { label: "hunch" },
  );
}

export const POST = withTiming(createHunch);
