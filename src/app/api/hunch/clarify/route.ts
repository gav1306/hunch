import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recallPriors } from "@/lib/memory/recall";
import { hunchInputSchema } from "@/lib/schemas/hypothesis";
import { askClarifying } from "@/mastra/agents/clarifier";

/**
 * Pre-hunch step: given raw text, the Clarifier returns <=3 tappable questions.
 * Creates nothing — the Hunch row is written later by POST /api/hunch once the
 * user has answered and the coach commits a hypothesis.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = hunchInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A hunch can't be empty." }, { status: 400 });
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
