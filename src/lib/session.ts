import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/** The fields the app reads off a session's user. */
export type AppSession = { user: { id: string; name: string; email: string } };

const DEV_USER = {
  id: "dev-user",
  name: "Dev",
  email: "dev@hunch.local",
} as const;

/**
 * Session for server routes/pages. In normal operation this delegates to
 * better-auth. When `DEV_AUTH_BYPASS=1` (and not production), it skips login
 * entirely and returns a stable dev user — created on first use so foreign
 * keys (hunch.userId etc.) resolve. Lets you hit the app without signing in
 * on every reload while iterating locally.
 */
export async function getSession(
  headers: Headers,
): Promise<AppSession | null> {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTH_BYPASS === "1"
  ) {
    await db.user.upsert({
      where: { id: DEV_USER.id },
      update: {},
      create: { ...DEV_USER, emailVerified: true },
    });
    return { user: { ...DEV_USER } };
  }

  return auth.api.getSession({ headers });
}
