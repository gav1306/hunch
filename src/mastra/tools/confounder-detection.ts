import type { Confounder } from "@/lib/schemas/protocol";

/**
 * Surface-and-warn confounder handling (RESEARCH §10 decision). The Hypothesis
 * Coach already names confounders in free text; this deterministic tool (RULES
 * §3 — no LLM) structures each one and attaches a plain-language control we bake
 * into the protocol. No statistical adjustment at v1 — that's Phase 4.
 */
type Rule = {
  keywords: string[];
  type: Confounder["type"];
  control: string;
};

const RULES: Rule[] = [
  { keywords: ["caffeine", "coffee", "tea"], type: "behavioral", control: "Hold caffeine intake constant throughout the experiment." },
  { keywords: ["sleep"], type: "physiological", control: "Keep your sleep schedule consistent across all phases." },
  { keywords: ["stress"], type: "behavioral", control: "Note stressful days and keep your routine as steady as you can." },
  { keywords: ["exercise", "workout", "training"], type: "behavioral", control: "Keep exercise volume steady; don't start a new routine mid-trial." },
  { keywords: ["alcohol", "drinking"], type: "behavioral", control: "Avoid changing your alcohol intake during the experiment." },
  { keywords: ["travel", "trip"], type: "environmental", control: "Avoid scheduling travel during the trial; flag any unavoidable trips." },
  { keywords: ["illness", "sick", "cold"], type: "physiological", control: "Note any illness; pause judgement on those days as it distorts the signal." },
  { keywords: ["weekend", "weekends"], type: "environmental", control: "Balance baseline and intervention across weekdays and weekends." },
  { keywords: ["weather", "season"], type: "environmental", control: "Note weather changes; they can move the outcome independently." },
];

export function detectConfounders(names: string[]): Confounder[] {
  return names.map((name) => {
    const lower = name.toLowerCase();
    const rule = RULES.find((r) => r.keywords.some((k) => lower.includes(k)));

    return {
      name,
      type: rule?.type ?? "behavioral",
      expectedDirection: "unknown",
      control: rule?.control ?? `Keep "${name}" as constant as possible across all phases.`,
    };
  });
}
