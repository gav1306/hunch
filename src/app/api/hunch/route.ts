import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recallPriors } from "@/lib/memory/recall";
import { hunchInputSchema } from "@/lib/schemas/hypothesis";
import { sharpenHunch } from "@/mastra/agents/hypothesis-coach";

/**
 * Core loop, step one: drop a hunch -> Hypothesis Coach sharpens it -> persist
 * the Hunch and its Hypothesis, then return the pair for the Hunch Card.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = hunchInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A hunch can't be empty." }, {
      status: 400,
    });
  }

  const priors = await recallPriors(session.user.id, parsed.data.rawText);
  const sharpened = await sharpenHunch(parsed.data.rawText, priors);

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
}
