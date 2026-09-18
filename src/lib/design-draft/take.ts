import { db } from "@/lib/db";
import { designResultSchema, type DesignResult } from "@/lib/schemas/protocol";

/** Longest confirm waits on a draft still being designed. */
export const DRAFT_WAIT_MS = 10_000;
/** How often it looks again while waiting. */
export const DRAFT_POLL_MS = 250;
/** A `designing` row this old was cut off (a killed `after()`), not slow. */
export const DRAFT_STALE_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The background design for this hunch, if it was made from the same inputs
 * the user just confirmed. Waits on one still in flight — it started earlier,
 * so waiting never costs more than designing inline would. Null means "design
 * it now": no draft, other inputs, failed, stale, unreadable, or not done in
 * time. It never throws on a draft's account.
 */
export async function takeDraft(hunchId: string, fingerprint: string): Promise<DesignResult | null> {
  const deadline = Date.now() + DRAFT_WAIT_MS;
  for (;;) {
    const row = await db.designDraft.findUnique({ where: { hunchId } });
    if (!row || row.fingerprint !== fingerprint) return null;

    if (row.status === "ready") {
      const parsed = designResultSchema.safeParse(row.result);
      return parsed.success ? parsed.data : null;
    }
    if (row.status !== "designing") return null;
    if (Date.now() - row.updatedAt.getTime() > DRAFT_STALE_MS) return null;
    if (Date.now() >= deadline) return null;

    await sleep(DRAFT_POLL_MS);
  }
}
