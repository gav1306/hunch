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

/** What the confirm gate sends: the confirmed list, and its say on the shape. */
export type DesignInput = {
  parameters: ParameterDraft[];
  /**
   * The user's override of the Coach's schedulable guess. Safe to send on
   * every request — the route only acts on it when it actually flips the
   * stored value, so an always-scheduled hunch keeps a reporting-only
   * exposure row untouched.
   */
  schedulable: boolean;
};

async function postDesign(hunchId: string, input: DesignInput): Promise<DesignResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/protocol`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  // Tolerate a non-JSON / empty body (e.g. an unhandled 5xx) instead of letting
  // res.json() throw a raw "Unexpected end of JSON input" at the UI.
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    throw new Error(body?.error ?? "Something went wrong designing your protocol.");
  }
  return body as DesignResponse;
}

/** Design (or redesign) the protocol for a sharpened hunch. */
export function useDesignProtocol(hunchId: string) {
  return useMutation({
    mutationFn: (input: DesignInput) => postDesign(hunchId, input),
  });
}
