import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * A per-user daily budget for the routes that call a model.
 *
 * Every clarify, sharpen and design costs money, and nothing stopped one
 * account from looping them. A real day of use is a handful of hunches, each a
 * few calls, so the default leaves plenty of room while capping what a script
 * can spend. Days are UTC: the budget is a cost guard, not a feature, so it
 * doesn't need the user's own calendar.
 */
export const DEFAULT_DAILY_AI_LIMIT = 60;

function dailyLimit(): number {
  const fromEnv = Number(process.env.AI_DAILY_LIMIT);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_DAILY_AI_LIMIT;
}

/**
 * Count one AI request against the user's day. Returns null when it's within
 * budget, or the 429 the route should send. One statement, so two requests at
 * once can't both read "59" and both go through.
 */
export async function spendAiCall(userId: string): Promise<NextResponse | null> {
  const limit = dailyLimit();
  const [row] = await db.$queryRaw<{ calls: number }[]>`
    INSERT INTO "AiUsage" ("userId", "day", "calls")
    VALUES (${userId}, (now() AT TIME ZONE 'UTC')::date, 1)
    ON CONFLICT ("userId", "day") DO UPDATE SET "calls" = "AiUsage"."calls" + 1
    RETURNING "calls"`;

  if (Number(row?.calls ?? 0) <= limit) return null;
  return NextResponse.json(
    {
      error: `You've reached today's limit of ${limit} AI requests. It resets at midnight UTC.`,
    },
    { status: 429 },
  );
}
