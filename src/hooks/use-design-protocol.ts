"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  Confounder,
  PowerInfo,
  ProtocolDesign,
  SafetyVerdict,
} from "@/lib/schemas/protocol";

/** The protocol design API response. */
export type DesignResponse = {
  protocol: {
    id: string;
    safetyState: "approved" | "refused" | "pending";
    design: ProtocolDesign;
    powerInfo: PowerInfo;
    confounders: Confounder[];
  };
  safety: SafetyVerdict;
};

async function postDesign(hunchId: string): Promise<DesignResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/protocol`, { method: "POST" });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Something went wrong designing your protocol.");
  }
  return body as DesignResponse;
}

/** Design (or redesign) the protocol for a sharpened hunch. */
export function useDesignProtocol(hunchId: string) {
  return useMutation({ mutationFn: () => postDesign(hunchId) });
}
