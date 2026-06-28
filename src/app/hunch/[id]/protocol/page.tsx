"use client";

import { use } from "react";
import { Button } from "@/components/ui/button";
import { ProtocolTrack } from "@/components/protocol-track";
import { useDesignProtocol } from "@/hooks/use-design-protocol";

/**
 * Phase 3 UI: design a protocol for a hunch and render the phase track when
 * approved, or the "talk to a doctor" refusal panel when the Safety Reviewer
 * refuses. Hunch is NOT medical advice.
 */
export default function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const design = useDesignProtocol(id);
  const data = design.data;
  const refused = data?.protocol.safetyState === "refused";

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-bold">Design your protocol</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        We&apos;ll turn your hypothesis into a safe, runnable n-of-1 experiment.
      </p>

      <Button
        className="mt-4"
        onClick={() => design.mutate()}
        disabled={design.isPending}
      >
        {design.isPending ? "Designing…" : data ? "Redesign protocol" : "Design my protocol"}
      </Button>

      {design.isError && (
        <p className="mt-4 text-sm text-destructive">{design.error.message}</p>
      )}

      {data && !refused && (
        <div className="mt-6">
          <ProtocolTrack
            design={data.protocol.design}
            powerInfo={data.protocol.powerInfo}
            confounders={data.protocol.confounders}
          />
        </div>
      )}

      {data && refused && (
        <section className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-6">
          <h2 className="text-lg font-semibold text-destructive">
            Let&apos;s not run this one on your own
          </h2>
          <p className="mt-2 text-sm">{data.safety.reason}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            Hunch is not medical advice. Please talk to a doctor before trying this.
          </p>
        </section>
      )}
    </main>
  );
}
