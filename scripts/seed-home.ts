/**
 * Dev-only: attach a spread of hunches (loggable-today, logged-today running,
 * needs-setup, and a concluded verdict) to an existing user so /home can be
 * exercised past the empty state. Idempotent-ish: clears this user's hunches first.
 *
 *   npx tsx scripts/seed-home.ts <email>
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { ProtocolDesign } from "../src/lib/schemas/protocol";

const email = process.argv[2] ?? "demo1@hunch.app";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** UTC midnight `n` days ago. */
function daysAgo(n: number): Date {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - n * 86_400_000);
}

const design = (): ProtocolDesign => ({
  phases: [
    { label: "A", kind: "baseline", days: 7, name: "Normal coffee", action: "Keep your usual coffee; log sleep each morning." },
    { label: "B", kind: "intervention", days: 7, name: "No coffee after 2pm", action: "Skip caffeine after 2pm; log sleep each morning." },
    { label: "A", kind: "baseline", days: 7, name: "Normal coffee", action: "Back to usual coffee; log sleep each morning." },
  ],
  washoutDays: 2,
  controls: ["Keep bedtime within 30 min", "No caffeine after 2pm"],
  instructions: "Log each morning. Baseline = usual routine; intervention = the change under test.",
});

async function main() {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) throw new Error(`No user with email ${email}. Sign up first, then re-run.`);

  await db.hunch.deleteMany({ where: { userId: user.id } });

  // 1) Running, phase A, day 4 — loggable today, NOT logged → lands in "Today".
  await db.hunch.create({
    data: {
      userId: user.id,
      rawText: "Magnesium before bed makes me sleep deeper",
      status: "running",
      hypothesis: {
        create: {
          statement: "Taking magnesium glycinate before bed increases deep-sleep minutes",
          outcomeMetric: "Deep sleep minutes (wearable)",
          outcomeType: "continuous",
          confounders: ["alcohol", "screen time"],
        },
      },
      parameters: {
        create: [
          {
            label: "Deep sleep minutes",
            type: "continuous",
            unit: "min",
            isPrimary: true,
            sortOrder: 0,
          },
          { label: "Bedtime feel", type: "continuous", unit: "1-10", min: 1, max: 10, sortOrder: 1 },
          { label: "Woke up rested", type: "binary", sortOrder: 2 },
        ],
      },
      protocol: {
        create: { design: design(), safetyState: "approved", startedAt: daysAgo(3) },
      },
    },
  });

  // 2) Running, day 10 (phase B), already logged today → lands in "In flight" only.
  const logged = await db.hunch.create({
    data: {
      userId: user.id,
      rawText: "Cold showers cut my afternoon crash",
      status: "running",
      hypothesis: {
        create: {
          statement: "A morning cold shower reduces afternoon energy dips",
          outcomeMetric: "Afternoon crash (yes/no)",
          outcomeType: "binary",
          confounders: ["lunch size"],
        },
      },
      parameters: {
        create: [{ label: "Afternoon crash", type: "binary", isPrimary: true, sortOrder: 0 }],
      },
      protocol: {
        create: { design: design(), safetyState: "approved", startedAt: daysAgo(9) },
      },
    },
    include: { parameters: true },
  });
  await db.checkIn.create({
    data: {
      hunchId: logged.id,
      phase: "B",
      loggedOn: daysAgo(0),
      values: { create: [{ parameterId: logged.parameters[0].id, value: 0 }] },
    },
  });

  // 3) Sharpened, no protocol started → "Needs setup".
  await db.hunch.create({
    data: {
      userId: user.id,
      rawText: "Walking after lunch steadies my blood sugar",
      status: "sharpened",
      hypothesis: {
        create: {
          statement: "A 15-min post-lunch walk lowers my 2-hour glucose spike",
          outcomeMetric: "Peak glucose (CGM)",
          outcomeType: "continuous",
          confounders: ["meal carbs"],
        },
      },
      parameters: {
        create: [
          { label: "Peak glucose", type: "continuous", unit: "mg/dL", isPrimary: true, sortOrder: 0 },
          { label: "Walked after lunch", type: "binary", sortOrder: 1 },
        ],
      },
    },
  });

  // 4) Concluded with a verdict → "Verdicts".
  await db.hunch.create({
    data: {
      userId: user.id,
      rawText: "Cutting coffee after noon fixes my sleep",
      status: "concluded",
      hypothesis: {
        create: {
          statement: "No caffeine after noon increases total sleep time",
          outcomeMetric: "Total sleep time",
          outcomeType: "continuous",
          confounders: ["stress"],
        },
      },
      parameters: {
        create: [
          { label: "Total sleep time", type: "continuous", unit: "min", isPrimary: true, sortOrder: 0 },
        ],
      },
      protocol: {
        create: { design: design(), safetyState: "approved", startedAt: daysAgo(30) },
      },
      verdict: {
        create: {
          category: "helped",
          narrative:
            "Cutting caffeine after noon added ~34 min of sleep on average. The effect is credible (95% CI excludes zero).",
          pEffect: 0.94,
          effect: 34,
          ciLow: 8,
          ciHigh: 60,
          nA: 14,
          nB: 14,
          model: "normal-normal",
        },
      },
    },
  });

  const count = await db.hunch.count({ where: { userId: user.id } });
  console.log(`Seeded ${count} hunches for ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
