"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useClarify } from "@/hooks/use-clarify";
import { BlockedHunchError, useCreateHunch } from "@/hooks/use-create-hunch";
import type { HunchInfo } from "@/hooks/use-hunch-info";
import type { ClarifyingAnswer, ClarifyingQuestion } from "@/lib/schemas/clarify";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Where an unsent hunch waits out a reload. */
const DRAFT_KEY = "hunch:new-draft";

/**
 * The action button, which becomes an indeterminate progress bar while the
 * hunch is being sharpened — the user stays on the same view instead of
 * blanking to a loader and then a redirect. `loading` wins over `enabled`.
 */
function actionClass(enabled: boolean, loading: boolean): string {
  if (loading) {
    return "mt-3.5 border-ink bg-[linear-gradient(100deg,var(--ink)_30%,color-mix(in_srgb,var(--ink)_55%,var(--paper))_50%,var(--ink)_70%)] bg-[length:220%_100%] font-bold text-paper animate-[hunch-btn-sweep_1.1s_linear_infinite] hover:bg-[length:220%_100%]";
  }
  return cn(
    "mt-3.5 border-ink font-bold",
    enabled ? "bg-ink text-paper" : "text-muted-foreground",
  );
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
    <div className="grid gap-2.5">
      <p className="m-0 text-base leading-snug tracking-[0.01em] text-ink">{question.prompt}</p>
      <div className="flex flex-wrap gap-2">
        {question.options.map((opt, i) => {
          const active = value === opt;
          return (
            <Button
              key={opt}
              // The first option is where "answer this one" sends focus.
              id={i === 0 ? `question-${question.id}` : undefined}
              type="button"
              variant="brand"
              size="touch"
              aria-pressed={active}
              onClick={() => onChange(opt)}
              className={cn(
                "font-mono normal-case tracking-normal [overflow-wrap:anywhere]",
                active
                  ? "border-s1 bg-[color-mix(in_srgb,var(--paper)_80%,var(--s1))]"
                  : "border-rule",
              )}
            >
              {opt}
            </Button>
          );
        })}
      </div>
      {question.allowOther && (
        <Input
          value={isOther ? value : other}
          onChange={(e) => {
            setOther(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="something else…"
          aria-label={`${question.prompt} — something else`}
          className={cn("w-full font-mono", isOther && "border-s1")}
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
  // A draft survives a reload. The text is the whole of what the user typed and
  // it lived only in component state, so a refresh, a back button or a tab
  // crash lost it — on the one screen whose entire job is to catch a thought
  // before it goes. A seeded or resumed hunch has its own text and ignores it.
  const [rawText, setRawText] = useState(() => {
    if (resuming?.rawText) return resuming.rawText;
    if (seed) return seed;
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(DRAFT_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [questions, setQuestions] = useState<ClarifyingQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /** Why the last press didn't do anything, when the form isn't ready yet. */
  const [nudge, setNudge] = useState<string | null>(null);
  const clarify = useClarify();
  const createHunch = useCreateHunch(resuming?.id);

  // Once sharpened, hand off to the protocol page — that's where the user
  // confirms the hypothesis and the plan is designed (Variation B: one page).
  // Seed the protocol page's query cache with the hypothesis we already have so
  // it renders the confirm gate instantly instead of blanking on a refetch.
  // Set when the user chooses the log rather than editing their hunch, so the
  // success effect knows which door they came through.
  const keptAsLog = useRef(false);

  useEffect(() => {
    const hunch = createHunch.data;
    if (!hunch) return;
    // The hunch exists now; the draft has served its purpose.
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to clean up if storage was never available.
    }
    queryClient.setQueryData<HunchInfo>(["hunch-info", hunch.id], {
      hypothesis: {
        statement: hunch.hypothesis.statement,
        outcomeMetric: hunch.hypothesis.outcomeMetric,
        outcomeType: hunch.hypothesis.outcomeType,
      },
      parameters: hunch.parameters ?? [],
      protocol: null,
      archivedAt: null,
    });
    // A hunch kept as a log skips the design gate entirely: there is nothing to
    // design, and sending it there would offer to plan the very trial the app
    // just declined. It gets its one-phase protocol and goes straight to the
    // dashboard.
    if (keptAsLog.current) {
      keptAsLog.current = false;
      void fetch(`/api/hunch/${hunch.id}/observe`, { method: "POST" }).then(() =>
        router.push(`/hunch/${hunch.id}`),
      );
      return;
    }
    router.push(`/hunch/${hunch.id}/protocol`);
  }, [createHunch.data, queryClient, router]);

  // Written on a short delay so a fast typist isn't hitting storage per key.
  useEffect(() => {
    // A seeded or resumed hunch has its own text — writing it would overwrite
    // an unsent draft the user parked here on their way to this follow-up.
    if (resuming || seed) return;
    const id = setTimeout(() => {
      try {
        if (rawText.trim()) window.localStorage.setItem(DRAFT_KEY, rawText);
        else window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Private mode, or storage full. The draft is a convenience.
      }
    }, 400);
    return () => clearTimeout(id);
  }, [rawText, resuming, seed]);

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
    if (clarify.isPending) return;
    // The button stays live on an empty box and says what it wants, rather
    // than greying out and leaving the user to work out why.
    if (!text) {
      setNudge("Write the hunch first — a sentence in your own words is plenty.");
      document.getElementById("raw-text")?.focus();
      return;
    }
    setNudge(null);
    clarify.mutate(text, {
      onSuccess: (qs) => setQuestions(qs),
      // Degrade: if the clarifier fails, skip straight to a one-shot sharpen —
      // unless it didn't fail but refused, in which case falling through would
      // run the very thing that was just declined.
      onError: (err) => {
        if (err instanceof BlockedHunchError) return;
        createHunch.mutate({ rawText: text, answers: [] });
      },
    });
  }

  function commit() {
    if (!questions) return;
    const unanswered = questions.find((q) => (answers[q.id] ?? "").trim() === "");
    if (unanswered) {
      setNudge("Answer the questions above and the coach can sharpen this properly.");
      document.getElementById(`question-${unanswered.id}`)?.focus();
      return;
    }
    setNudge(null);
    const payload: ClarifyingAnswer[] = questions
      .filter((q) => (answers[q.id] ?? "").trim() !== "")
      .map((q) => ({ id: q.id, prompt: q.prompt, answer: answers[q.id].trim() }));
    createHunch.mutate({ rawText: rawText.trim(), answers: payload });
  }

  const allAnswered = questions?.every((q) => (answers[q.id] ?? "").trim() !== "") ?? false;
  // Sharpen is in flight (or just resolved and we're about to navigate).
  const busy = createHunch.isPending || !!createHunch.data;
  // The app declined to plan this one. `Edit my hunch` resets the mutation and
  // the textarea still holds what they typed — nothing is thrown away.
  const blocked =
    createHunch.error instanceof BlockedHunchError
      ? createHunch.error
      : clarify.error instanceof BlockedHunchError
        ? clarify.error
        : null;

  return (
    <div>
      <style>{`
        @keyframes hunch-btn-sweep { from { background-position: 220% 0 } to { background-position: -220% 0 } }
        @media (prefers-reduced-motion: reduce) {
          [data-hunch-loading] { animation: none !important }
        }
      `}</style>

      {!questions ? (
        <div
          className={cn(
            "mt-10 transition-opacity duration-300",
            step === "asking" && "pointer-events-none opacity-40",
          )}
        >
          <h1 className="m-0 font-heading text-[clamp(30px,4.4vw,48px)] font-bold tracking-[-0.02em] text-ink">
            {resuming ? "Say it another way" : "What\u2019s nagging you?"}
          </h1>
          <p className="mt-3.5 mb-0 text-base leading-relaxed text-muted-foreground">
            {resuming
              ? "Your original words are below \u2014 reword them and the coach will sharpen this same hunch again."
              : "Drop a gut feeling about your life. The coach asks a couple of quick questions, then sharpens it."}
          </p>
          <form onSubmit={startClarify} className="mt-[26px]">
            <textarea
              id="raw-text"
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setNudge(null);
              }}
              rows={3}
              autoFocus
              disabled={step === "asking" || busy}
              placeholder="coffee after lunch wrecks my sleep…"
              className="w-full resize-none rounded-[var(--radius-control)] border border-input bg-transparent px-4 py-3.5 text-[16px] leading-normal text-ink transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-base"
            />
            <Button
              type="submit"
              variant="brand"
              size="touch"
              data-hunch-loading={busy || undefined}
              disabled={step === "asking" || busy}
              className={actionClass(!!rawText.trim(), busy || step === "asking")}
            >
              {busy ? "Sharpening…" : step === "asking" ? "Thinking…" : "Sharpen it"}
            </Button>
          </form>
        </div>
      ) : (
        <div className="mt-10 grid gap-[22px]">
          {/* The quoted hunch used to be the end of the road: the coach's
              questions are answers to *these words*, and if they came back
              wrong there was no way back to them short of the browser's back
              button, which discarded the questions too. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="m-0 text-sm text-muted-foreground italic [overflow-wrap:anywhere]">
              &ldquo;{rawText}&rdquo;
            </p>
            <Button
              type="button"
              variant="brand"
              size="touch"
              disabled={busy}
              onClick={() => {
                setQuestions(null);
                setAnswers({});
                setNudge(null);
              }}
              className="border-transparent px-1 text-muted-foreground hover:border-transparent hover:bg-transparent hover:text-ink"
            >
              <PencilIcon data-icon="inline-start" aria-hidden />
              edit
            </Button>
          </div>
          <h1 className="m-0 font-heading text-[clamp(24px,3.4vw,34px)] font-bold tracking-[-0.02em] text-ink">
            A couple of quick things
          </h1>
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              value={answers[q.id] ?? ""}
              onChange={(a) => {
                setAnswers((prev) => ({ ...prev, [q.id]: a }));
                setNudge(null);
              }}
            />
          ))}
          <div>
            <Button
              type="button"
              variant="brand"
              size="touch"
              onClick={commit}
              data-hunch-loading={busy || undefined}
              disabled={busy}
              className={actionClass(allAnswered, busy)}
            >
              {busy ? "Sharpening…" : "Lock it in"}
            </Button>
          </div>
        </div>
      )}

      {nudge && (
        <p role="alert" className="mt-4 text-sm text-s1 [overflow-wrap:anywhere]">
          {nudge}
        </p>
      )}

      {/* A refusal, not a failure. It gets a card and two doors rather than a
          red line: the person asking has usually noticed something real, and a
          dead end is why they'd leave. */}
      {blocked ? (
        <section
          role="alert"
          className="mt-5 rounded-xl border border-rule bg-card p-[clamp(20px,2.4vw,28px)]"
        >
          <p className="m-0 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
            {blocked.message}
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button
              type="button"
              variant="brand"
              size="touch"
              disabled={createHunch.isPending}
              onClick={() => {
                keptAsLog.current = true;
                createHunch.mutate({
                  rawText: rawText.trim(),
                  answers: [],
                  observeOnly: true,
                });
              }}
            >
              {createHunch.isPending ? "Setting it up…" : "Track it as it is"}
            </Button>
            <Button
              type="button"
              variant="brand"
              size="touch"
              onClick={() => {
                createHunch.reset();
                clarify.reset();
                document.getElementById("raw-text")?.focus();
              }}
            >
              Edit my hunch
            </Button>
          </div>
        </section>
      ) : (clarify.isError && step === "idle") || createHunch.isError ? (
        <p role="alert" className="mt-5 text-sm text-s1 [overflow-wrap:anywhere]">
          {createHunch.error?.message ?? clarify.error?.message}
        </p>
      ) : null}
    </div>
  );
}
