"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useCheckIn } from "@/hooks/use-checkin";
import type { HomeData, HomeHunch } from "@/lib/home";

const EXAMPLES = [
  "Does coffee after lunch wreck my sleep?",
  "Do I focus better with my phone in another room?",
  "Does a 10-min walk beat my afternoon slump?",
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const } },
};

const VERDICT_LABEL: Record<string, { text: string; color: string }> = {
  helped: { text: "Helped", color: "var(--s1)" },
  hurt: { text: "Hurt", color: "var(--s1)" },
  inconclusive_no_effect: { text: "No effect", color: "var(--muted)" },
  inconclusive_insufficient: { text: "Not enough data", color: "var(--muted)" },
};

function eyebrow(text: string) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: "0.24em",
        textTransform: "uppercase",
        color: "var(--muted)",
        marginBottom: 18,
      }}
    >
      <span style={{ color: "var(--s1)" }}>✦</span> {text}
    </div>
  );
}

const cardBase: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  background: "color-mix(in srgb, var(--paper) 90%, var(--ink))",
  border: "1px solid var(--rule)",
  padding: "clamp(20px,2.2vw,28px)",
};

function statement(h: HomeHunch) {
  return (
    <div
      style={{
        fontFamily: "'Clash Display',sans-serif",
        fontWeight: 600,
        fontSize: "clamp(17px,1.7vw,21px)",
        lineHeight: 1.25,
        letterSpacing: "-0.01em",
        color: "var(--ink)",
      }}
    >
      {h.statement}
    </div>
  );
}

/** One check-in row with the inline tap. */
function CheckinRow({ h }: { h: HomeHunch }) {
  const checkIn = useCheckIn(h.id);
  const [num, setNum] = useState("");
  const done = checkIn.isSuccess;
  const primary = h.primaryParameter;

  return (
    <div
      style={{
        ...cardBase,
        borderTop: "2px solid transparent",
        borderImage: "linear-gradient(90deg,var(--s1),var(--s2)) 1",
        opacity: done ? 0.6 : 1,
        transition: "opacity 300ms ease",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 10,
        }}
      >
        {h.phaseLabel ?? "today"}
        {h.progress ? ` · day ${h.progress.day} of ${h.progress.total}` : ""}
      </div>
      {statement(h)}

      {done ? (
        <div style={{ marginTop: 16, fontSize: 13, color: "var(--s2)" }}>
          Logged ✓ — see you tomorrow.
        </div>
      ) : !primary ? null : (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--muted)",
              marginBottom: 10,
            }}
          >
            {primary.label}
          </div>
          {primary.type === "binary" ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="app-tap"
                disabled={checkIn.isPending}
                onClick={() => checkIn.mutate([{ parameterId: primary.id, value: 1 }])}
                style={tapBtn(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className="app-tap"
                disabled={checkIn.isPending}
                onClick={() => checkIn.mutate([{ parameterId: primary.id, value: 0 }])}
                style={tapBtn(false)}
              >
                No
              </button>
            </div>
          ) : (
            <form
              style={{ display: "flex", gap: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(num);
                if (num.trim() !== "" && Number.isFinite(n))
                  checkIn.mutate([{ parameterId: primary.id, value: n }]);
              }}
            >
              <input
                type="number"
                step="any"
                min={primary.min ?? undefined}
                max={primary.max ?? undefined}
                aria-label={primary.label}
                value={num}
                onChange={(e) => setNum(e.target.value)}
                placeholder="reading"
                style={{
                  width: 120,
                  padding: "10px 12px",
                  background: "color-mix(in srgb, var(--paper) 82%, var(--ink))",
                  border: "1px solid var(--rule)",
                  color: "var(--ink)",
                  fontFamily: "'Space Mono',monospace",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <button type="submit" className="app-tap" disabled={checkIn.isPending} style={tapBtn(true)}>
                Log
              </button>
            </form>
          )}
          {checkIn.isError && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--s1)" }}>
              {(checkIn.error as Error).message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function tapBtn(filled: boolean): React.CSSProperties {
  return {
    padding: "11px 22px",
    border: "1px solid var(--ink)",
    cursor: "pointer",
    fontFamily: "'Space Mono',monospace",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    background: filled ? "var(--ink)" : "transparent",
    color: filled ? "var(--paper)" : "var(--ink)",
  };
}

function ProgressBar({ day, total }: { day: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (day / total) * 100) : 0;
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        Day {day} of {total}
      </div>
      <div style={{ position: "relative", height: 2, background: "var(--rule)" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            background: "linear-gradient(90deg,var(--s1),var(--s2))",
          }}
        />
      </div>
    </div>
  );
}

export function HomeView({ user, data }: { user: { name: string }; data: HomeData }) {
  const firstName = (user.name || "there").split(" ")[0];
  const reduce = useReducedMotion();

  return (
    <div>
      <style>{`.app-tap:disabled{opacity:.5;cursor:not-allowed;} .app-tap:hover:not(:disabled){filter:brightness(0.94);}`}</style>

      <motion.h1
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{
          margin: "0 0 clamp(28px,5vh,48px)",
          fontFamily: "'Clash Display',sans-serif",
          fontWeight: 700,
          fontSize: "clamp(30px,4vw,46px)",
          letterSpacing: "-0.02em",
          color: "var(--ink)",
        }}
      >
        Hi, {firstName}.
      </motion.h1>

      {!data.hasAny ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(40px,7vh,72px)" }}>
          {/* Today */}
          <section>
            {eyebrow("Today · check in")}
            {data.today.length > 0 ? (
              <div style={{ display: "grid", gap: "clamp(12px,1.6vw,18px)" }}>
                {data.today.map((h) => (
                  <CheckinRow key={h.id} h={h} />
                ))}
              </div>
            ) : (
              <div style={{ ...cardBase, color: "var(--muted)", fontSize: 14 }}>
                {data.running.length > 0
                  ? "All caught up ✓ — nothing to log today."
                  : "No experiments running yet. Drop a hunch to start one."}
              </div>
            )}
          </section>

          {/* Verdicts */}
          {data.verdicts.length > 0 && (
            <section>
              {eyebrow("Verdict ready")}
              <div style={{ display: "grid", gap: "clamp(12px,1.6vw,18px)", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
                {data.verdicts.map((h) => {
                  const v = VERDICT_LABEL[h.verdict!.category] ?? {
                    text: h.verdict!.category,
                    color: "var(--muted)",
                  };
                  return (
                    <Link key={h.id} href={`/hunch/${h.id}`} className="app-card" style={{ ...cardBase }}>
                      <div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
                        The reveal →
                      </div>
                      {statement(h)}
                      <div
                        style={{
                          marginTop: 16,
                          fontFamily: "'Clash Display',sans-serif",
                          fontWeight: 700,
                          fontSize: "clamp(26px,3vw,40px)",
                          letterSpacing: "-0.03em",
                          color: v.color,
                        }}
                      >
                        {v.text}
                        <span style={{ color: "var(--s2)" }}>.</span>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--muted)" }}>
                        {Math.round(h.verdict!.pEffect * 100)}% sure
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* In flight */}
          {data.running.length > 0 && (
            <section>
              {eyebrow("In flight")}
              <div style={{ display: "grid", gap: "clamp(12px,1.6vw,18px)", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
                {data.running.map((h) => (
                  <Link key={h.id} href={`/hunch/${h.id}`} className="app-card" style={{ ...cardBase }}>
                    <div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: h.loggedToday ? "var(--s2)" : "var(--muted)", marginBottom: 10 }}>
                      {h.loggedToday ? "Logged today ✓" : "Running"}
                      {h.phaseLabel ? ` · ${h.phaseLabel}` : ""}
                    </div>
                    {statement(h)}
                    {h.progress && <ProgressBar day={h.progress.day} total={h.progress.total} />}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Needs setup */}
          {data.needsSetup.length > 0 && (
            <section>
              {eyebrow("Finish setting up")}
              <div style={{ display: "grid", gap: "clamp(12px,1.6vw,18px)", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
                {data.needsSetup.map((h) => (
                  <Link key={h.id} href={`/hunch/${h.id}`} className="app-card" style={{ ...cardBase }}>
                    <div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
                      Sharpened · needs a plan →
                    </div>
                    {statement(h)}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={container}
      initial={reduce ? "show" : "hidden"}
      animate="show"
      style={{ position: "relative", maxWidth: 620 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/starburst.png"
        alt=""
        aria-hidden
        width={150}
        height={150}
        style={{ position: "absolute", top: -40, right: -20, width: 150, opacity: 0.08, pointerEvents: "none", userSelect: "none" }}
      />

      <motion.div
        variants={item}
        style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(28px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--ink)" }}
      >
        Got a hunch?{" "}
        <span style={{ backgroundImage: "linear-gradient(92deg,var(--s1),var(--s2))", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>
          Prove it.
        </span>
      </motion.div>

      <motion.p variants={item} style={{ margin: "16px 0 28px", fontSize: 14, lineHeight: 1.7, color: "var(--muted)" }}>
        Drop a gut feeling about your life. The coach sharpens it into something
        you can actually test — then the math calls it.
      </motion.p>

      <motion.div variants={item}>
        <Link
          href="/hunch/new"
          className="app-newhunch"
          style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "15px 26px", border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", textDecoration: "none" }}
        >
          Drop your first hunch →
        </Link>
      </motion.div>

      <motion.div variants={item} style={{ marginTop: 40 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>
          For instance
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {EXAMPLES.map((q) => (
            <Link
              key={q}
              href={`/hunch/new?seed=${encodeURIComponent(q)}`}
              className="app-card"
              style={{ ...cardBase, display: "flex", alignItems: "center", gap: 12, fontSize: 13.5 }}
            >
              <span style={{ color: "var(--s1)" }}>✦</span>
              {q}
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
