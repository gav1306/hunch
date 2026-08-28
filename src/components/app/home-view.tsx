"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckIn } from "@/components/check-in";
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

/**
 * Where a half-set-up hunch should send the user, and what its card should say.
 *
 * Every one of these used to be a single card reading "Sharpened · needs a plan"
 * pointing at /hunch/{id} — the dashboard, which for an un-started hunch renders
 * "Your trial hasn't started yet." and nothing else. The one card whose whole job
 * was to resume setup routed away from the setup page.
 */
const SETUP_CTA: Record<
  "needs-sharpening" | "needs-plan" | "ready-to-start",
  { text: string; href: (id: string) => string }
> = {
  "needs-sharpening": {
    text: "Draft · pick up where you left off →",
    href: (id) => `/hunch/new?resume=${id}`,
  },
  "needs-plan": {
    text: "Sharpened · needs a plan →",
    href: (id) => `/hunch/${id}/protocol`,
  },
  "ready-to-start": {
    text: "Plan ready · start it →",
    href: (id) => `/hunch/${id}/protocol`,
  },
};

/** "Starts tomorrow", "Starts in 3 days" — for an anchored trial with no day yet. */
function startsCopy(iso: string): string {
  const start = new Date(iso);
  const now = new Date();
  const days = Math.round(
    (Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()) -
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
      86_400_000,
  );
  if (days <= 1) return "Starts tomorrow";
  return `Starts in ${days} days`;
}

const VERDICT_LABEL: Record<string, { text: string; color: string }> = {
  helped: { text: "Helped", color: "var(--good)" },
  hurt: { text: "Hurt", color: "var(--bad)" },
  inconclusive_no_effect: { text: "No effect", color: "var(--neutral)" },
  inconclusive_insufficient: { text: "Not enough data", color: "var(--neutral)" },
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

/**
 * One card on home, with today's log inside it. The card's chrome is home's;
 * the logging is the shared CheckIn, so home and the dashboard validate the
 * same way and make the same promise about changing today's entry.
 */
function CheckinRow({ h }: { h: HomeHunch }) {
  const [done, setDone] = useState(false);
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
          fontSize: 12,
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

      {primary && (
        <div style={{ marginTop: 18 }}>
          <CheckIn
            variant="compact"
            hunchId={h.id}
            parameters={[{ ...primary, isPrimary: true }]}
            onLogged={() => setDone(true)}
          />
        </div>
      )}
    </div>
  );
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
      {/* `.app-newhunch` used to be defined in AppShell, which the empty state
          borrowed from two components away. It only ever styled this one link,
          so it lives with it until the screen migration replaces it. */}
      <style>{`.app-newhunch{transition:background 200ms ease,color 200ms ease,border-color 200ms ease;} .app-newhunch:hover{background:var(--s1);color:var(--paper);border-color:var(--s1);}`}</style>

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
                    <div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: !h.startsOn && h.loggedToday ? "var(--good)" : "var(--muted)", marginBottom: 10 }}>
                      {/* Anchored but not yet begun — a start the user scheduled
                          for tomorrow, which has no day and nothing to log. It is
                          not a confirmation, so it stays muted rather than green. */}
                      {h.startsOn
                        ? startsCopy(h.startsOn)
                        : h.loggedToday
                          ? "Logged today ✓"
                          : "Running"}
                      {!h.startsOn && h.phaseLabel ? ` · ${h.phaseLabel}` : ""}
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
                {data.needsSetup.map((h) => {
                  const cta = SETUP_CTA[h.setupStage ?? "needs-plan"];
                  return (
                    <Link key={h.id} href={cta.href(h.id)} className="app-card" style={{ ...cardBase }}>
                      <div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
                        {cta.text}
                      </div>
                      {statement(h)}
                    </Link>
                  );
                })}
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
