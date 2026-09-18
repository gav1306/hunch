import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { designProtocol } from "@/mastra/workflows/design";
import { designFingerprint, designInputFor } from "./fingerprint";

/**
 * Design a freshly sharpened hunch's plan while the user reads the confirm
 * gate, and store it for `takeDraft`. Scheduled with `after()` by the sharpen
 * routes, so nothing is waiting on it and nothing may reach its caller: every
 * failure is logged and, where a row exists, recorded as `failed`. Confirm
 * designs inline whenever this didn't produce a matching draft.
 */
export async function predesign(hunchId: string): Promise<void> {
  try {
    const hunch = await db.hunch.findUnique({
      where: { id: hunchId },
      include: { hypothesis: true, parameters: true },
    });
    if (!hunch?.hypothesis) return;

    const { schedulable } = hunch.hypothesis;
    const exposureLabel = hunch.parameters.find((p) => p.isExposure)?.label.trim();
    // The user names the daily yes/no on the gate; until then there is no
    // observational design to make.
    if (!schedulable && !exposureLabel) return;

    const input = designInputFor(hunch.hypothesis, { schedulable, exposureLabel });
    const fingerprint = designFingerprint(input);

    await db.designDraft.upsert({
      where: { hunchId },
      create: { hunchId, fingerprint, status: "designing" },
      update: { fingerprint, status: "designing", result: Prisma.DbNull },
    });

    let data: { status: "ready"; result: Prisma.InputJsonValue } | { status: "failed" };
    try {
      data = { status: "ready", result: (await designProtocol(input)) as Prisma.InputJsonValue };
    } catch (err) {
      console.error("[predesign] failed:", err);
      data = { status: "failed" };
    }

    // Guarded by the fingerprint: a re-sharpen that started a newer design
    // while this one ran owns the row now, and this write matches nothing.
    await db.designDraft.updateMany({ where: { hunchId, fingerprint }, data });
  } catch (err) {
    console.error("[predesign] failed:", err);
  }
}
