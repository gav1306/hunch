import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NewHunchForm } from "@/components/hunch/new-hunch-form";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { parseSeed } from "@/lib/seed";

export default async function NewHunchPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string | string[]; resume?: string | string[] }>;
}) {
  const session = await getSession(await headers());
  if (!session) redirect("/signin");

  const { seed, resume } = await searchParams;
  const raw = Array.isArray(seed) ? seed[0] : seed;

  // `?resume=` re-sharpens an existing hunch rather than starting a new one, so
  // the textarea opens on the words the user actually typed. Resolved here
  // rather than client-side so there is no blank frame before the prefill.
  const resumeId = Array.isArray(resume) ? resume[0] : resume;
  const found = resumeId
    ? await db.hunch.findFirst({
        where: { id: resumeId, userId: session.user.id },
        select: {
          id: true,
          rawText: true,
          protocol: { select: { startedAt: true } },
          _count: { select: { checkIns: true } },
        },
      })
    : null;
  // A trial already under way can't be re-sharpened; fall through to a blank
  // page rather than offering an edit the API will refuse.
  const resuming =
    found && !found.protocol?.startedAt && found._count.checkIns === 0
      ? { id: found.id, rawText: found.rawText }
      : null;

  return <NewHunchForm seed={parseSeed(raw)} resuming={resuming} />;
}
