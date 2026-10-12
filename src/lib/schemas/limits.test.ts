import { describe, expect, it } from "vitest";
import { MAX_ANSWER_CHARS, MAX_HUNCH_CHARS, sharpenRequestSchema } from "@/lib/schemas/clarify";
import { hunchInputSchema } from "@/lib/schemas/hypothesis";
import {
  MAX_LABEL_CHARS,
  checkInValuesInputSchema,
  trackerAddSchema,
  trackerSchema,
} from "@/lib/schemas/parameter";

const long = (n: number) => "x".repeat(n);

describe("input limits", () => {
  it("caps a hunch's length, on clarify and on sharpen", () => {
    expect(hunchInputSchema.safeParse({ rawText: long(MAX_HUNCH_CHARS) }).success).toBe(true);
    expect(hunchInputSchema.safeParse({ rawText: long(MAX_HUNCH_CHARS + 1) }).success).toBe(false);
    expect(sharpenRequestSchema.safeParse({ rawText: long(MAX_HUNCH_CHARS + 1) }).success).toBe(false);
  });

  it("says what's wrong when a hunch is too long", () => {
    const r = hunchInputSchema.safeParse({ rawText: long(MAX_HUNCH_CHARS + 1) });
    expect(r.error?.issues[0].message).toMatch(/shorter/i);
  });

  it("caps the clarifying answers, in number and in length", () => {
    const answer = (a: string) => ({ id: "q", prompt: "How?", answer: a });
    expect(
      sharpenRequestSchema.safeParse({ rawText: "x", answers: [answer(long(MAX_ANSWER_CHARS + 1))] }).success,
    ).toBe(false);
    expect(
      sharpenRequestSchema.safeParse({ rawText: "x", answers: Array(11).fill(answer("a")) }).success,
    ).toBe(false);
  });

  it("caps a tracker's label and unit", () => {
    expect(trackerSchema.safeParse({ label: long(MAX_LABEL_CHARS + 1), type: "binary" }).success).toBe(false);
    expect(trackerSchema.safeParse({ label: "sleep", type: "amount", unit: long(25) }).success).toBe(false);
  });

  it("refuses a new tracker whose minimum isn't below its maximum", () => {
    // Such a tracker would refuse every value logged against it.
    expect(trackerAddSchema.safeParse({ label: "x", type: "amount", min: 10, max: 1 }).success).toBe(false);
    expect(trackerAddSchema.safeParse({ label: "x", type: "amount", min: 1, max: 10 }).success).toBe(true);
  });

  it("caps how many readings one check-in can carry", () => {
    const values = Array(21).fill({ parameterId: "p1", value: 1 });
    expect(checkInValuesInputSchema.safeParse({ values }).success).toBe(false);
  });
});

describe("clarifying options", () => {
  it("drops the slashes and quotes a model sometimes wraps them in", async () => {
    const { clarifyingQuestionSchema } = await import("@/lib/schemas/clarify");
    const q = clarifyingQuestionSchema.parse({
      id: "measure",
      prompt: "How would you measure it?",
      options: ["/I estimate how many minutes/", '"From a sleep tracker"', "By feel"],
      allowOther: true,
    });
    expect(q.options).toEqual(["I estimate how many minutes", "From a sleep tracker", "By feel"]);
  });
});
