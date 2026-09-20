import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CausalEdge } from "@/generated/prisma/client";

vi.mock("@/lib/memory/causal-graph", () => ({ readEdges: vi.fn() }));
vi.mock("@/mastra/agents/memory", () => ({ recallRelevantPriors: vi.fn() }));

import { recallPriors, recallPriorsForReuse } from "./recall";
import { readEdges } from "@/lib/memory/causal-graph";
import { recallRelevantPriors } from "@/mastra/agents/memory";

const edge = (over: Partial<CausalEdge>): CausalEdge => ({
  id: "e", userId: "u1", cause: "", effect: "", direction: "increases",
  effectSize: 1, confidence: 0.9, sourceHunchId: "h", createdAt: new Date(),
  ...over,
});

const caffeine = edge({
  sourceHunchId: "h_caf",
  cause: "Cutting afternoon caffeine increases nightly sleep duration.",
  effect: "hours of sleep from a tracker",
});
const coffee = edge({
  sourceHunchId: "h_cof",
  cause: "Morning coffee improves sleep onset.",
  effect: "minutes to fall asleep",
});

describe("recallPriors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readEdges).mockResolvedValue([caffeine, coffee]);
  });

  it("asks the memory agent when nothing has been recalled for this text yet", async () => {
    vi.mocked(recallRelevantPriors).mockResolvedValue({ relatedSourceHunchIds: ["h_caf"] });

    const priors = await recallPriors("u1", "does caffeine hurt my sleep?");

    expect(recallRelevantPriors).toHaveBeenCalledTimes(1);
    expect(priors.map((p) => p.sourceHunchId)).toEqual(["h_caf"]);
  });

  it("reuses ids already recalled for the same text instead of asking the model again", async () => {
    const priors = await recallPriors("u1", "does caffeine hurt my sleep?", ["h_caf"]);

    expect(recallRelevantPriors).not.toHaveBeenCalled();
    expect(priors.map((p) => p.sourceHunchId)).toEqual(["h_caf"]);
  });

  it("trusts an empty recalled list: the model already said nothing relates", async () => {
    const priors = await recallPriors("u1", "does caffeine hurt my sleep?", []);

    expect(recallRelevantPriors).not.toHaveBeenCalled();
    expect(priors).toEqual([]);
  });

  it("drops a reused id that isn't one of this user's candidates for the text", async () => {
    // The ids come back from the browser, so they are a hint, not a record:
    // only the user's own edges that match these words can become priors.
    const priors = await recallPriors("u1", "does caffeine hurt my sleep?", [
      "h_caf",
      "someone-elses-hunch",
    ]);

    expect(recallRelevantPriors).not.toHaveBeenCalled();
    expect(priors.map((p) => p.sourceHunchId)).toEqual(["h_caf"]);
  });
});

describe("recallPriorsForReuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readEdges).mockResolvedValue([caffeine, coffee]);
  });

  it("returns the picked ids alongside the priors", async () => {
    vi.mocked(recallRelevantPriors).mockResolvedValue({ relatedSourceHunchIds: ["h_caf"] });

    const out = await recallPriorsForReuse("u1", "does caffeine hurt my sleep?");

    expect(out.priors.map((p) => p.sourceHunchId)).toEqual(["h_caf"]);
    expect(out.priorIds).toEqual(["h_caf"]);
  });

  it("leaves priorIds unset when the memory agent fails, so sharpen tries again", async () => {
    // An empty list here would read as "the model found nothing" and a
    // returning user would lose their prior for good on one flaky call.
    vi.mocked(recallRelevantPriors).mockRejectedValue(new Error("402 out of credits"));

    const out = await recallPriorsForReuse("u1", "does caffeine hurt my sleep?");

    expect(out.priors).toEqual([]);
    expect(out.priorIds).toBeUndefined();
  });
});
