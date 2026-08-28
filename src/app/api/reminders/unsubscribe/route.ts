import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribe } from "@/lib/reminders";

/**
 * Turn reminders off from the email, with no session.
 *
 * An unsubscribe link that asks you to sign in first is not an unsubscribe
 * link. The link carries an HMAC over the user id instead, which is enough to
 * authorise the one thing this route can do — and the one thing it does is
 * narrow: set `reminderHour` to null. It cannot read anything, change anything
 * else, or say whether the id it was given exists.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";

  const ok = userId !== "" && verifyUnsubscribe(userId, token);
  if (ok) {
    // updateMany, not update: a stale link for a deleted account should be a
    // no-op, not a 500.
    await db.user.updateMany({
      where: { id: userId },
      data: { reminderHour: null, remindersOptOut: true },
    });
  }

  // The same page either way. A link that says "no such account" turns an
  // unsubscribe endpoint into an account checker.
  return new NextResponse(page(), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reminders off · Hunch</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100dvh; display: grid; place-items: center;
    background: #0e0d12; color: #f2ecdd; padding: 24px;
    font-family: "Space Mono", ui-monospace, SFMono-Regular, monospace;
  }
  main { max-width: 32rem; }
  h1 { font-size: 1.5rem; line-height: 1.2; margin: 0 0 0.75rem; }
  p { font-size: 0.9375rem; line-height: 1.6; color: #8c8676; margin: 0 0 1rem; }
  a { color: #ff3b14; }
</style>
</head>
<body>
  <main>
    <h1>Reminders are off.</h1>
    <p>
      You won't get any more daily emails from Hunch. Your experiments keep
      running — logging just won't be nudged.
    </p>
    <p><a href="/security">Turn them back on in your security settings</a></p>
  </main>
</body>
</html>`;
}
