import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { recallPriors } from "@/lib/memory/recall";
import { sharpenRequestSchema } from "@/lib/schemas/clarify";
import { sharpenHunch } from "@/mastra/agents/hypothesis-coach";

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

  try {
    const priors = await recallPriors(session.user.id, parsed.data.rawText);
    const sharpened = await sharpenHunch(parsed.data.rawText, priors, parsed.data.answers);

    const hunch = await db.hunch.create({
      data: {
        userId: session.user.id,
        rawText: parsed.data.rawText,
        status: "sharpened",
        hypothesis: {
          create: {
            statement: sharpened.statement,
            outcomeMetric: sharpened.outcomeMetric,
            outcomeType: sharpened.outcomeType,
            confounders: sharpened.confounders,
          },
        },
      },
      include: { hypothesis: true },
    });

    return NextResponse.json({ hunch, priors }, { status: 201 });
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
