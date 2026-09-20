import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { timed, withTiming } from "@/lib/timing";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { pickExposure, toParameterDto } from "@/lib/parameters";
import { parameterListSchema } from "@/lib/schemas/parameter";
import { designProtocol, resolveSafetyState } from "@/mastra/workflows/design";
import { designFingerprint, designInputFor } from "@/lib/design-draft/fingerprint";
import { takeDraft } from "@/lib/design-draft/take";

/**
 * Phase 3: design a protocol for a sharpened hunch. Takes the parameter set the
 * user confirmed on the gate, replaces the proposed set with it, runs the design
 * workflow (confounders -> trial length -> design -> safety review), applies the
 * safety gate, and persists the Protocol. Parameters and Protocol are written
 * in one transaction — a designed trial always has exactly one primary parameter.
 *
 * Two shapes come out of here. A hunch whose change can be applied on demand
 * gets the scheduled ABA trial. One whose change cannot ("play basketball")
 * gets a single observation window, and the confirmed list must carry the
 * daily yes/no its arms are derived from.
 *
 * Designing does NOT start the trial. This route used to stamp `startedAt` and
 * flip the hunch to "running" the moment the workflow returned, so the clock
 * began before the user had read a phase — read the plan tonight, begin
 * tomorrow, and a baseline day was already spent. The hunch stays "sharpened"
 * with a designed plan until POST /api/hunch/[id]/start, which is now the only
 * writer of `startedAt`.
 */
async function designHunch(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await timed("db-load", () =>
    db.hunch.findFirst({
      where: { id, userId: session.user.id },
      include: { hypothesis: true, protocol: true, _count: { select: { checkIns: true } } },
    }),
  );
  if (!hunch) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (!hunch.hypothesis || hunch.status === "draft") {
    return NextResponse.json(
      { error: "Sharpen this hunch into a hypothesis first." },
      { status: 409 },
    );
  }
  // Designing replaces the parameter set, and readings hang off parameters by a
  // cascading key — so a redesign once anything is logged would erase the trial's
  // data. Retrying a failed design is still fine: nothing has been logged yet.
  if (hunch._count.checkIns > 0) {
    return NextResponse.json(
      { error: "You've already logged days on this plan — redesigning would erase them." },
      { status: 409 },
    );
  }
  // A started trial has an anchor every logged day is measured from. Redesigning
  // would replace the phases underneath it while leaving the anchor in place.
  if (hunch.protocol?.startedAt) {
    return NextResponse.json(
      { error: "This trial has already started — redesigning would move the goalposts." },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const confirmed = parameterListSchema.safeParse((body as { parameters?: unknown })?.parameters);
  if (!confirmed.success) {
    return NextResponse.json(
      { error: "Pick one main thing to measure before we design this." },
      { status: 400 },
    );
  }

  // The confirm gate can overrule the Coach about whether this change can be
  // applied on demand — the user knows their own week better than the model
  // does. Absent an override, the stored answer stands.
  const override = (body as { schedulable?: unknown })?.schedulable;
  const storedSchedulable = hunch.hypothesis.schedulable;
  const schedulable = typeof override === "boolean" ? override : storedSchedulable;
  const observational = !schedulable;

  // An exposure that was assigning arms must not survive the flip to a design
  // where the calendar assigns them: it would be a second, silent claim on the
  // same days. Only an actual flip strips. An exposure on a hunch that was
  // always schedulable is the adherence count — how many phase-B days the user
  // managed — and is none of this route's business.
  const flippedToScheduled = override === true && storedSchedulable === false;
  const confirmedRows = flippedToScheduled
    ? confirmed.data.map((p) => ({ ...p, isExposure: false }))
    : confirmed.data;

  const exposure = pickExposure(confirmedRows);
  if (observational && !exposure) {
    return NextResponse.json(
      {
        error:
          "Tell us the one yes/no we should ask each day — it's how we tell your days apart.",
      },
      { status: 400 },
    );
  }

  try {
    // The same builder `predesign` uses, so a background design of these exact
    // inputs has this exact fingerprint. No usable draft: design now, as ever.
    const input = designInputFor(hunch.hypothesis, { schedulable, exposureLabel: exposure?.label });
    const result =
      (await timed("draft", () => takeDraft(hunch.id, designFingerprint(input)))) ??
      (await designProtocol(input));

    const safetyState = resolveSafetyState(result.safety);
    // No `startedAt` here, deliberately: the user starts the trial, not the
    // designer. See the note on this route.
    const protocolData = {
      design: result.design,
      powerInfo: result.powerInfo,
      confounders: result.confounders,
      safetyState,
    };

    const { protocol, parameters } = await db.$transaction(async (tx) => {
      // The override and the design it produced are one write. A stored
      // `schedulable` that disagreed with the protocol beside it would make the
      // next redesign silently pick the other shape.
      if (typeof override === "boolean" && override !== storedSchedulable) {
        await tx.hypothesis.update({
          where: { hunchId: hunch.id },
          data: { schedulable: override },
        });
      }
      // Replace, not merge: the confirmed list is the whole truth for this hunch.
      await tx.parameter.deleteMany({ where: { hunchId: hunch.id } });
      await tx.parameter.createMany({
        data: confirmedRows.map((p, i) => ({
          hunchId: hunch.id,
          label: p.label,
          type: p.type,
          unit: p.unit ?? null,
          min: p.min ?? null,
          max: p.max ?? null,
          isPrimary: p.isPrimary,
          isExposure: p.isExposure,
          sortOrder: i,
        })),
      });

      // A draft is used once. "Try again" or a later redesign starts fresh
      // rather than replaying a stored safety verdict.
      await tx.designDraft.deleteMany({ where: { hunchId: hunch.id } });

      const saved = await tx.protocol.upsert({
        where: { hunchId: hunch.id },
        create: { hunchId: hunch.id, ...protocolData },
        update: protocolData,
      });

      const rows = await tx.parameter.findMany({
        where: { hunchId: hunch.id },
        orderBy: { sortOrder: "asc" },
      });
      return { protocol: saved, parameters: rows };
    });

    return NextResponse.json(
      {
        protocol,
        parameters: parameters.map(toParameterDto),
        safety: result.safety,
        hypothesis: {
          statement: hunch.hypothesis.statement,
          outcomeMetric: hunch.hypothesis.outcomeMetric,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    // The designer or safety reviewer (LLM) or the write failed. Nothing was
    // saved — the transaction never ran or rolled back — so a retry is safe.
    // Answer with JSON so the plan page shows a message, not a JSON parse error.
    console.error("[protocol] design failed:", err);
    return NextResponse.json(
      { error: "Couldn't design your plan right now. Please try again in a moment." },
      { status: 502 },
    );
  }
}

export const POST = withTiming(designHunch);
