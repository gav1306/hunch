import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { recallPriors } from "@/lib/memory/recall";
import { hunchInputSchema } from "@/lib/schemas/hypothesis";
import { askClarifying } from "@/mastra/agents/clarifier";
import { MEDICATION_REFUSAL, medicationIntent } from "@/lib/safety/medication";

/**
 * Pre-hunch step: given raw text, the Clarifier returns <=3 tappable questions.
 * Creates nothing — the Hunch row is written later by POST /api/hunch once the
 * user has answered and the coach commits a hypothesis.
 */
export async function POST(request: Request) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = hunchInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A hunch can't be empty." }, { status: 400 });
  }

  // This is the true first touch — the form asks for questions before it asks
  // for a hypothesis. Refusing here means the user never answers three
  // clarifying questions only to be turned down at the end of them.
  if (medicationIntent(parsed.data.rawText)) {
    return NextResponse.json(
      { blocked: "medication", error: MEDICATION_REFUSAL },
      { status: 422 },
    );
  }

  try {
    const priors = await recallPriors(session.user.id, parsed.data.rawText);
    const { questions } = await askClarifying(parsed.data.rawText, priors);
    return NextResponse.json({ questions }, { status: 200 });
  } catch (err) {
    console.error("[clarify] failed:", err);
    return NextResponse.json(
      { error: "Couldn't think of questions right now." },
      { status: 502 },
    );
  }
}
