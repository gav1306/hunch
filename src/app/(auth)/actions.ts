"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Starts "Continue with Google" on the server. As a form action it survives a
 * click that lands before the sign-in page has hydrated: React queues the
 * submit instead of dropping it, which a plain onClick handler did. The
 * nextCookies plugin carries the OAuth state cookie onto this response.
 */
export async function continueWithGoogle(): Promise<{ error: string | null }> {
  let url: string | undefined;
  try {
    const res = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: "/home" },
      headers: await headers(),
    });
    url = res.url;
  } catch {
    // Fall through to the message below.
  }
  if (!url) return { error: "Couldn't reach Google. Try again." };
  redirect(url);
}
