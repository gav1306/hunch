"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { CheckIn } from "@/components/check-in";
import type { HomeData, HomeHunch } from "@/lib/home";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Does coffee after lunch wreck my sleep?",
  "Do I focus better with my phone in another room?",
  "Does a 10-min walk beat my afternoon slump?",
];

/** How many verdicts stay open before the rest collapse behind a count. */
const VERDICTS_SHOWN = 2;

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
    text: "Draft · pick up where you left off",
    href: (id) => `/hunch/new?resume=${id}`,
  },
  "needs-plan": {
    text: "Sharpened · needs a plan",
    href: (id) => `/hunch/${id}/protocol`,
  },
  "ready-to-start": {
    text: "Plan ready · start it",
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

/**
 * The scanning badge for a concluded trial. Direction, not verdict: the engine
 * knows a number rose or fell, never whether that was a win — "Helped" on a
 * rising bug count read as a green tick on a bad week. Confirmed/Reversed
 * needs the hypothesis' expected direction, which the Coach does not write yet.
 */
const VERDICT_LABEL: Record<string, { text: string; className: string }> = {
  helped: { text: "Increase", className: "text-neutral" },
  hurt: { text: "Decrease", className: "text-neutral" },
  inconclusive_no_effect: { text: "No difference", className: "text-neutral" },
  inconclusive_insufficient: { text: "Not enough days", className: "text-neutral" },
};

/**
 * The section heading: brand mark, then the label.
 *
 * An <h2>, not a styled div — home went h1 straight to card text, so a screen
 * reader's outline of this page was a single heading and a pile of links.
 */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-[18px] text-xs font-normal tracking-[0.24em] text-muted-foreground uppercase">
      <span aria-hidden className="text-s1">
        ✦
      </span>{" "}
      {children}
    </h2>
  );
}

/** Every card on this screen sits on the same ground, at the same radius. */
const CARD = "block rounded-lg border border-rule bg-card p-[clamp(20px,2.2vw,28px)] no-underline";

/** The eyebrow line inside a card — 12px, the readable floor, not 10.5. */
const CARD_EYEBROW = "mt-0 mb-2.5 text-xs tracking-[0.16em] uppercase";

function Statement({ h }: { h: HomeHunch }) {
  return (
    <p className="m-0 font-heading text-[clamp(17px,1.7vw,21px)] leading-tight font-semibold tracking-[-0.01em] text-ink">
      {h.statement}
    </p>
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
      className={cn(
        CARD,
        // The accent rule along the top of a card you can log into. Tailwind
        // has no border-image utility, so this is the arbitrary property.
        "border-t-2 border-t-transparent [border-image:linear-gradient(90deg,var(--s1),var(--s2))_1]",
        "transition-opacity duration-300",
        done && "opacity-60",
      )}
    >
      <p className={cn(CARD_EYEBROW, "text-muted-foreground")}>
        {h.phaseLabel ?? "today"}
        {h.progress ? ` · day ${h.progress.day} of ${h.progress.total}` : ""}
      </p>
      <Statement h={h} />

      {primary && (
        <div className="mt-[18px]">
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
    <div className="mt-4">
      <p className="mt-0 mb-2 text-xs tracking-[0.1em] text-muted-foreground uppercase">
        Day {day} of {total}
      </p>
      <div className="relative h-0.5 bg-rule">
        <div
          className="absolute inset-y-0 left-0 bg-linear-to-r from-s1 to-s2"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** A concluded experiment, as a card. */
function VerdictCard({ h }: { h: HomeHunch }) {
  const v = VERDICT_LABEL[h.verdict!.category] ?? {
    text: h.verdict!.category,
    className: "text-muted-foreground",
  };
  return (
    <Link href={`/hunch/${h.id}`} className={cn(CARD, "app-card")}>
      <p className={cn(CARD_EYEBROW, "text-muted-foreground")}>
        The reveal
        <ArrowRightIcon aria-hidden className="ml-1 inline-block size-(--icon) align-[-0.15em]" />
      </p>
      <Statement h={h} />
      <p
        className={cn(
          "mt-4 mb-0 font-heading text-[clamp(26px,3vw,40px)] font-bold tracking-[-0.03em]",
          v.className,
        )}
      >
        {v.text}
        <span className="text-s2">.</span>
      </p>
      <p className="mt-2 mb-0 text-xs text-muted-foreground">
        {Math.round(h.verdict!.pEffect * 100)}% sure
      </p>
    </Link>
  );
}

const GRID = "grid gap-[clamp(12px,1.6vw,18px)] grid-cols-[repeat(auto-fit,minmax(280px,1fr))]";

export function HomeView({ user, data }: { user: { name: string }; data: HomeData }) {
  const firstName = (user.name || "there").split(" ")[0];
  const reduce = useReducedMotion();

  // Verdicts are the payoff, but they are also permanent: by the tenth
  // experiment home was mostly a list of answers the user already knows, with
  // today's logging pushed below them. The newest stay open; the rest are one
  // line away, with a count so nothing looks lost.
  const openVerdicts = data.verdicts.slice(0, VERDICTS_SHOWN);
  const olderVerdicts = data.verdicts.slice(VERDICTS_SHOWN);

  return (
    <div>
      <motion.h1
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mt-0 mb-[clamp(28px,5vh,48px)] font-heading text-[clamp(30px,4vw,46px)] font-bold tracking-[-0.02em] text-ink"
      >
        Hi, {firstName}.
      </motion.h1>

      {!data.hasAny ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-[clamp(40px,7vh,72px)]">
          <section>
            <Eyebrow>Today · check in</Eyebrow>
            {data.today.length > 0 ? (
              <div className="grid gap-[clamp(12px,1.6vw,18px)]">
                {data.today.map((h) => (
                  <CheckinRow key={h.id} h={h} />
                ))}
              </div>
            ) : (
              <p className={cn(CARD, "m-0 text-sm text-muted-foreground")}>
                {data.running.length > 0 ? (
                  <>
                    <CheckIcon
                      aria-hidden
                      className="mr-1.5 inline-block size-(--icon) align-[-0.15em]"
                    />
                    All caught up — nothing to log today.
                  </>
                ) : (
                  "No experiments running yet. Drop a hunch to start one."
                )}
              </p>
            )}
          </section>

          {data.verdicts.length > 0 && (
            <section>
              <Eyebrow>Verdict ready</Eyebrow>
              <div className={GRID}>
                {openVerdicts.map((h) => (
                  <VerdictCard key={h.id} h={h} />
                ))}
              </div>

              {olderVerdicts.length > 0 && (
                <details className="group mt-[clamp(12px,1.6vw,18px)]">
                  <summary className="flex h-11 cursor-pointer list-none items-center gap-2 text-xs tracking-[0.16em] text-muted-foreground uppercase hover:text-ink">
                    <span aria-hidden className="text-s1 group-open:hidden">
                      +
                    </span>
                    <span aria-hidden className="hidden text-s1 group-open:inline">
                      −
                    </span>
                    {olderVerdicts.length} earlier verdict
                    {olderVerdicts.length === 1 ? "" : "s"}
                  </summary>
                  <div className={cn(GRID, "mt-[clamp(12px,1.6vw,18px)]")}>
                    {olderVerdicts.map((h) => (
                      <VerdictCard key={h.id} h={h} />
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}

          {data.running.length > 0 && (
            <section>
              <Eyebrow>In flight</Eyebrow>
              <div className={GRID}>
                {data.running.map((h) => (
                  <Link key={h.id} href={`/hunch/${h.id}`} className={cn(CARD, "app-card")}>
                    {/* Anchored but not yet begun — a start the user scheduled
                        for tomorrow, which has no day and nothing to log. It is
                        not a confirmation, so it stays muted rather than green. */}
                    <p
                      className={cn(
                        CARD_EYEBROW,
                        !h.startsOn && h.loggedToday ? "text-good" : "text-muted-foreground",
                      )}
                    >
                      {h.startsOn ? (
                        startsCopy(h.startsOn)
                      ) : h.loggedToday ? (
                        <>
                          <CheckIcon
                            aria-hidden
                            className="mr-1 inline-block size-(--icon) align-[-0.15em]"
                          />
                          Logged today
                        </>
                      ) : (
                        "Running"
                      )}
                      {!h.startsOn && h.phaseLabel ? ` · ${h.phaseLabel}` : ""}
                    </p>
                    <Statement h={h} />
                    {h.progress && <ProgressBar day={h.progress.day} total={h.progress.total} />}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.needsSetup.length > 0 && (
            <section>
              <Eyebrow>Finish setting up</Eyebrow>
              <div className={GRID}>
                {data.needsSetup.map((h) => {
                  const cta = SETUP_CTA[h.setupStage ?? "needs-plan"];
                  return (
                    <Link key={h.id} href={cta.href(h.id)} className={cn(CARD, "app-card")}>
                      <p className={cn(CARD_EYEBROW, "text-muted-foreground")}>
                        {cta.text}
                        <ArrowRightIcon
                          aria-hidden
                          className="ml-1 inline-block size-(--icon) align-[-0.15em]"
                        />
                      </p>
                      <Statement h={h} />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {data.archived.length > 0 && (
            <section>
              <Eyebrow>Archived</Eyebrow>
              <details className="group">
                <summary className="flex h-11 cursor-pointer list-none items-center gap-2 text-xs tracking-[0.16em] text-muted-foreground uppercase hover:text-ink">
                  <span aria-hidden className="text-s1 group-open:hidden">
                    +
                  </span>
                  <span aria-hidden className="hidden text-s1 group-open:inline">
                    −
                  </span>
                  {data.archived.length} experiment
                  {data.archived.length === 1 ? "" : "s"}
                </summary>
                <div className={cn(GRID, "mt-[clamp(12px,1.6vw,18px)]")}>
                  {data.archived.map((h) => (
                    <Link key={h.id} href={`/hunch/${h.id}`} className={cn(CARD, "app-card")}>
                      <p className={cn(CARD_EYEBROW, "text-muted-foreground")}>
                        Open
                        <ArrowRightIcon
                          aria-hidden
                          className="ml-1 inline-block size-(--icon) align-[-0.15em]"
                        />
                      </p>
                      <Statement h={h} />
                    </Link>
                  ))}
                </div>
              </details>
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
      className="relative max-w-[620px]"
    >
      {/* next/image, so the 1024px source stops shipping at full size for a
          150px decoration. */}
      <Image
        src="/starburst.png"
        alt=""
        aria-hidden
        width={150}
        height={150}
        className="pointer-events-none absolute -top-10 -right-5 w-[150px] opacity-[0.08] select-none"
      />

      <motion.p
        variants={item}
        className="m-0 font-heading text-[clamp(28px,4vw,44px)] leading-[1.05] font-bold tracking-[-0.02em] text-ink"
      >
        Got a hunch?{" "}
        <span className="bg-[linear-gradient(92deg,var(--s1),var(--s2))] bg-clip-text text-transparent">
          Prove it.
        </span>
      </motion.p>

      <motion.p variants={item} className="mt-4 mb-7 text-sm leading-relaxed text-muted-foreground">
        Drop a gut feeling about your life. The coach sharpens it into something
        you can actually test — then the math calls it.
      </motion.p>

      <motion.div variants={item}>
        <Link
          href="/hunch/new"
          className="inline-flex items-center gap-2.5 border border-ink bg-ink px-6 py-4 font-mono text-[13px] font-bold tracking-[0.14em] text-paper uppercase no-underline transition-colors duration-200 hover:border-s1 hover:bg-s1 hover:text-paper"
        >
          Drop your first hunch
          <ArrowRightIcon aria-hidden className="size-(--icon)" />
        </Link>
      </motion.div>

      <motion.div variants={item} className="mt-10">
        <h2 className="mb-3.5 text-xs font-normal tracking-[0.2em] text-muted-foreground uppercase">
          For instance
        </h2>
        <div className="flex flex-col gap-2.5">
          {EXAMPLES.map((q) => (
            <Link
              key={q}
              href={`/hunch/new?seed=${encodeURIComponent(q)}`}
              className={cn(CARD, "app-card flex items-center gap-3 text-sm text-ink")}
            >
              <span aria-hidden className="text-s1">
                ✦
              </span>
              {q}
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
