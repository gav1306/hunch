"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useClarify } from "@/hooks/use-clarify";
import { useCreateHunch } from "@/hooks/use-create-hunch";
import type { HunchInfo } from "@/hooks/use-hunch-info";
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

/**
 * Action button that morphs into an indeterminate progress bar while the hunch
 * is being sharpened — keeps the user on the same view instead of blanking to a
 * loader screen, then a redirect. `loading` wins over `enabled`.
 */
function actionBtn(enabled: boolean, loading: boolean): React.CSSProperties {
  const base = primaryBtn(enabled);
  if (!loading) return base;
  return {
    ...base,
    color: "var(--paper)",
    cursor: "wait",
    border: "1px solid var(--ink)",
    background:
      "linear-gradient(100deg,var(--ink) 30%,color-mix(in srgb,var(--ink) 55%,var(--paper)) 50%,var(--ink) 70%)",
    backgroundSize: "220% 100%",
    animation: "hunch-btn-sweep 1.1s linear infinite",
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

export function NewHunchForm({
  seed,
  resuming = null,
}: {
  seed: string;
  /** Set when re-sharpening an existing hunch, carrying the text it started as. */
  resuming?: { id: string; rawText: string } | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState(resuming?.rawText ?? seed);
  const [questions, setQuestions] = useState<ClarifyingQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const clarify = useClarify();
  const createHunch = useCreateHunch(resuming?.id);

  // Once sharpened, hand off to the protocol page — that's where the user
  // confirms the hypothesis and the plan is designed (Variation B: one page).
  // Seed the protocol page's query cache with the hypothesis we already have so
  // it renders the confirm gate instantly instead of blanking on a refetch.
  useEffect(() => {
    const hunch = createHunch.data;
    if (!hunch) return;
    queryClient.setQueryData<HunchInfo>(["hunch-info", hunch.id], {
      hypothesis: {
        statement: hunch.hypothesis.statement,
        outcomeMetric: hunch.hypothesis.outcomeMetric,
        outcomeType: hunch.hypothesis.outcomeType,
      },
      parameters: hunch.parameters ?? [],
      protocol: null,
    });
    router.push(`/hunch/${hunch.id}/protocol`);
  }, [createHunch.data, queryClient, router]);

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

  const allAnswered = questions?.every((q) => (answers[q.id] ?? "").trim() !== "") ?? false;
  // Sharpen is in flight (or just resolved and we're about to navigate).
  const busy = createHunch.isPending || !!createHunch.data;

  return (
    <main style={{ minHeight: "100dvh", ...appThemeStyle() }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(20px,6vh,56px) 20px 96px" }}>
        <Link href="/home" style={{ ...label, textDecoration: "none" }}>← home</Link>

        <style>{`
          @keyframes hunch-btn-sweep { from { background-position: 220% 0 } to { background-position: -220% 0 } }
          @media (prefers-reduced-motion: reduce) {
            [data-hunch-loading] { animation: none !important }
          }
        `}</style>

        {!questions ? (
          <div style={{ marginTop: 40, opacity: step === "asking" ? 0.4 : 1, transition: "opacity 300ms ease", pointerEvents: step === "asking" ? "none" : "auto" }}>
            <h1 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(30px,4.4vw,48px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
              {resuming ? "Say it another way" : "What\u2019s nagging you?"}
            </h1>
            <p style={{ margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)" }}>
              {resuming
                ? "Your original words are below \u2014 reword them and the coach will sharpen this same hunch again."
                : "Drop a gut feeling about your life. The coach asks a couple of quick questions, then sharpens it."}
            </p>
            <form onSubmit={startClarify} style={{ marginTop: 26 }}>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={3}
                autoFocus
                disabled={step === "asking" || busy}
                placeholder="coffee after lunch wrecks my sleep…"
                style={{ width: "100%", resize: "none", padding: "14px 16px", background: "color-mix(in srgb,var(--paper) 82%,var(--ink))", border: "1px solid var(--rule)", color: "var(--ink)", fontFamily: "inherit", fontSize: 15, lineHeight: 1.5, outline: "none" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--s1)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
              />
              <button
                type="submit"
                data-hunch-loading={busy || undefined}
                disabled={step === "asking" || busy || !rawText.trim()}
                style={actionBtn(!!rawText.trim(), busy || step === "asking")}
              >
                {busy ? "Sharpening…" : step === "asking" ? "Thinking…" : "Sharpen it"}
              </button>
            </form>
          </div>
        ) : (
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
              <button
                type="button"
                onClick={commit}
                data-hunch-loading={busy || undefined}
                disabled={!allAnswered || busy}
                style={actionBtn(allAnswered, busy)}
              >
                {busy ? "Sharpening…" : "Lock it in"}
              </button>
            </div>
          </div>
        )}

        {(clarify.isError && step === "idle") || createHunch.isError ? (
          <p role="alert" style={{ marginTop: 20, fontSize: 13, color: "var(--s1)", overflowWrap: "anywhere" }}>
            {createHunch.error?.message ?? clarify.error?.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
