"use client";

import Link from "next/link";
import { useState } from "react";
import { useClarify } from "@/hooks/use-clarify";
import { useCreateHunch, type HunchWithHypothesis } from "@/hooks/use-create-hunch";
import type { ClarifyingAnswer, ClarifyingQuestion } from "@/lib/schemas/clarify";
import { appThemeStyle } from "@/lib/app-theme";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    marginTop: 14,
    padding: "14px 26px",
    border: "1px solid var(--ink)",
    background: enabled ? "var(--ink)" : "transparent",
    color: enabled ? "var(--paper)" : "var(--muted)",
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: "'Space Mono',monospace",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  };
}

/** One clarifying question rendered as tappable chips + an optional "other" input. */
function QuestionCard({
  question,
  value,
  onChange,
}: {
  question: ClarifyingQuestion;
  value: string;
  onChange: (answer: string) => void;
}) {
  const [other, setOther] = useState("");
  const isOther = value !== "" && !question.options.includes(value);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...label, color: "var(--ink)", textTransform: "none", letterSpacing: "0.01em", fontSize: 14.5 }}>
        {question.prompt}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {question.options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              style={{
                padding: "8px 14px",
                border: `1px solid ${active ? "var(--s1)" : "var(--rule)"}`,
                background: active ? "color-mix(in srgb,var(--paper) 80%,var(--s1))" : "transparent",
                color: "var(--ink)",
                fontFamily: "'Space Mono',monospace",
                fontSize: 12.5,
                cursor: "pointer",
                overflowWrap: "anywhere",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {question.allowOther && (
        <input
          value={isOther ? value : other}
          onChange={(e) => {
            setOther(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="something else…"
          style={{
            width: "100%",
            padding: "10px 12px",
            background: "color-mix(in srgb,var(--paper) 82%,var(--ink))",
            border: `1px solid ${isOther ? "var(--s1)" : "var(--rule)"}`,
            color: "var(--ink)",
            fontFamily: "'Space Mono',monospace",
            fontSize: 13,
            outline: "none",
          }}
        />
      )}
    </div>
  );
}

/** Lean done card — the sharpened hypothesis, no info dump. */
function LeanResult({ hunch, onReset }: { hunch: HunchWithHypothesis; onReset: () => void }) {
  const h = hunch.hypothesis;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ background: "color-mix(in srgb,var(--paper) 90%,var(--ink))", border: "1px solid var(--rule)", padding: "clamp(20px,2.4vw,28px)" }}>
        <div style={label}>Your hypothesis</div>
        <h2 style={{ margin: "10px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(19px,2.4vw,26px)", lineHeight: 1.25, letterSpacing: "-0.01em", color: "var(--ink)", overflowWrap: "anywhere" }}>
          {h.statement}
        </h2>
        <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "var(--muted)", overflowWrap: "anywhere" }}>
          Measured by {h.outcomeMetric}
        </p>
      </div>
      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Link
          href={`/hunch/${hunch.id}/protocol`}
          style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 24px", border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}
        >
          Continue →
        </Link>
        <button
          type="button"
          onClick={onReset}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}
        >
          start over
        </button>
      </div>
    </div>
  );
}

export function NewHunchForm({ seed }: { seed: string }) {
  const [rawText, setRawText] = useState(seed);
  const [questions, setQuestions] = useState<ClarifyingQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const clarify = useClarify();
  const createHunch = useCreateHunch();

  const step: "idle" | "asking" | "answering" | "committing" | "done" = createHunch.data
    ? "done"
    : createHunch.isPending
      ? "committing"
      : questions
        ? "answering"
        : clarify.isPending
          ? "asking"
          : "idle";

  function startClarify(e: React.FormEvent) {
    e.preventDefault();
    const text = rawText.trim();
    if (!text || clarify.isPending) return;
    clarify.mutate(text, {
      onSuccess: (qs) => setQuestions(qs),
      // Degrade: if the clarifier fails, skip straight to a one-shot sharpen.
      onError: () => createHunch.mutate({ rawText: text, answers: [] }),
    });
  }

  function commit() {
    if (!questions) return;
    const payload: ClarifyingAnswer[] = questions
      .filter((q) => (answers[q.id] ?? "").trim() !== "")
      .map((q) => ({ id: q.id, prompt: q.prompt, answer: answers[q.id].trim() }));
    createHunch.mutate({ rawText: rawText.trim(), answers: payload });
  }

  function reset() {
    createHunch.reset();
    clarify.reset();
    setQuestions(null);
    setAnswers({});
    setRawText("");
  }

  const allAnswered = questions?.every((q) => (answers[q.id] ?? "").trim() !== "") ?? false;

  return (
    <main style={{ minHeight: "100dvh", ...appThemeStyle() }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(20px,6vh,56px) 20px 96px" }}>
        <Link href="/home" style={{ ...label, textDecoration: "none" }}>← home</Link>

        {step === "idle" || step === "asking" ? (
          <div style={{ marginTop: 40, opacity: step === "asking" ? 0.4 : 1, transition: "opacity 300ms ease", pointerEvents: step === "asking" ? "none" : "auto" }}>
            <h1 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(30px,4.4vw,48px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
              What&apos;s nagging you?
            </h1>
            <p style={{ margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)" }}>
              Drop a gut feeling about your life. The coach asks a couple of quick questions, then sharpens it.
            </p>
            <form onSubmit={startClarify} style={{ marginTop: 26 }}>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={3}
                autoFocus
                disabled={step === "asking"}
                placeholder="coffee after lunch wrecks my sleep…"
                style={{ width: "100%", resize: "none", padding: "14px 16px", background: "color-mix(in srgb,var(--paper) 82%,var(--ink))", border: "1px solid var(--rule)", color: "var(--ink)", fontFamily: "inherit", fontSize: 15, lineHeight: 1.5, outline: "none" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--s1)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
              />
              <button type="submit" disabled={step === "asking" || !rawText.trim()} style={primaryBtn(!!rawText.trim())}>
                {step === "asking" ? "Thinking…" : "Sharpen it"}
              </button>
            </form>
          </div>
        ) : null}

        {step === "answering" && questions && (
          <div style={{ marginTop: 40, display: "grid", gap: 22 }}>
            <p style={{ margin: 0, fontStyle: "italic", fontSize: 13, color: "var(--muted)", overflowWrap: "anywhere" }}>
              &ldquo;{rawText}&rdquo;
            </p>
            <h1 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(24px,3.4vw,34px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
              A couple of quick things
            </h1>
            {questions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                value={answers[q.id] ?? ""}
                onChange={(a) => setAnswers((prev) => ({ ...prev, [q.id]: a }))}
              />
            ))}
            <div>
              <button type="button" onClick={commit} disabled={!allAnswered} style={primaryBtn(allAnswered)}>
                Lock it in
              </button>
            </div>
          </div>
        )}

        {step === "committing" && (
          <div style={{ marginTop: 44, textAlign: "center" }}>
            <div style={{ width: 200, height: 200, margin: "0 auto" }} aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/starburst.png"
                alt=""
                aria-hidden
                style={{ width: "60%", height: "60%", objectFit: "contain", opacity: 0.45, margin: "20% auto", display: "block" }}
              />
            </div>
            <p aria-live="polite" style={{ marginTop: 4, fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" }}>
              Sharpening…
            </p>
          </div>
        )}

        {step === "done" && createHunch.data && <LeanResult hunch={createHunch.data} onReset={reset} />}

        {(clarify.isError && step === "idle") || createHunch.isError ? (
          <p role="alert" style={{ marginTop: 20, fontSize: 13, color: "var(--s1)", overflowWrap: "anywhere" }}>
            {createHunch.error?.message ?? clarify.error?.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
