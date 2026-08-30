import type { Metadata } from "next";
import { ProtocolView } from "@/components/hunch/protocol-view";
import { readOwnedHunch } from "@/lib/hunch-read";
import { pageTitle } from "@/lib/titles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const hunch = await readOwnedHunch(id);
  if (!hunch) return { title: "The plan" };

  return { title: `Plan · ${pageTitle(hunch.statement ?? hunch.rawText)}` };
}

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Guarded by `[id]/layout.tsx`, which wraps this route too.
  const { id } = await params;
  return <ProtocolView id={id} />;
}
