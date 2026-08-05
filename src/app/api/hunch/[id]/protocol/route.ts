import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { toParameterDto } from "@/lib/parameters";
import { parameterListSchema } from "@/lib/schemas/parameter";
import { designProtocol, resolveSafetyState } from "@/mastra/workflows/design";

/**
 * Phase 3: design a protocol for a sharpened hunch. Takes the parameter set the
 * user confirmed on the gate, replaces the proposed set with it, runs the design
 * workflow (confounders -> trial length -> ABA design -> safety review), applies
 * the safety gate, persists the Protocol, and flips the hunch to "running" only
 * when approved. Parameters and Protocol are written in one transaction — a
 * designed trial always has exactly one primary parameter.
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
    include: { hypothesis: true },
  });
  if (!hunch) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (!hunch.hypothesis || hunch.status === "draft") {
    return NextResponse.json(
      { error: "Sharpen this hunch into a hypothesis first." },
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

  const result = await designProtocol({
    statement: hunch.hypothesis.statement,
    outcomeMetric: hunch.hypothesis.outcomeMetric,
    outcomeType: hunch.hypothesis.outcomeType as "binary" | "continuous",
    confounderNames: hunch.hypothesis.confounders,
  });

  const safetyState = resolveSafetyState(result.safety);
  const protocolData = {
    design: result.design,
    powerInfo: result.powerInfo,
    confounders: result.confounders,
    safetyState,
    startedAt: safetyState === "approved" ? new Date() : null,
  };

  const { protocol, parameters } = await db.$transaction(async (tx) => {
    // Replace, not merge: the confirmed list is the whole truth for this hunch.
    await tx.parameter.deleteMany({ where: { hunchId: hunch.id } });
    await tx.parameter.createMany({
      data: confirmed.data.map((p, i) => ({
        hunchId: hunch.id,
        label: p.label,
        type: p.type,
        unit: p.unit ?? null,
        min: p.min ?? null,
        max: p.max ?? null,
        isPrimary: p.isPrimary,
        sortOrder: i,
      })),
    });

    const saved = await tx.protocol.upsert({
      where: { hunchId: hunch.id },
      create: { hunchId: hunch.id, ...protocolData },
      update: protocolData,
    });

    if (safetyState === "approved") {
      await tx.hunch.update({ where: { id: hunch.id }, data: { status: "running" } });
    }

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
}
