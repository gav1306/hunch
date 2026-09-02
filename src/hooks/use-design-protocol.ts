"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  Confounder,
  PowerInfo,
  ProtocolDesign,
  SafetyVerdict,
} from "@/lib/schemas/protocol";
import type { ParameterDraft, Parameter } from "@/lib/schemas/parameter";

/** The protocol design API response. */
export type DesignResponse = {
  protocol: {
    id: string;
    /** "observe-only" is a diary: recorded, never scheduled. */
    safetyState: "approved" | "refused" | "pending" | "observe-only";
    design: ProtocolDesign;
    powerInfo: PowerInfo;
    confounders: Confounder[];
  };
  /** The parameter set as persisted from the user's confirmation. */
  parameters: Parameter[];
  safety: SafetyVerdict;
  /** The sharpened hypothesis this protocol tests — for the plan's header. */
  hypothesis: { statement: string; outcomeMetric: string };
};

async function postDesign(
  hunchId: string,
  parameters: ParameterDraft[],
): Promise<DesignResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/protocol`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parameters }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Something went wrong designing your protocol.");
  }
  return body as DesignResponse;
}

/** Design (or redesign) the protocol for a sharpened hunch. */
export function useDesignProtocol(hunchId: string) {
  return useMutation({
    mutationFn: (parameters: ParameterDraft[]) => postDesign(hunchId, parameters),
  });
}
