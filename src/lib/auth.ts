import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { isGoogleConfigured } from "@/lib/auth-providers";

export const auth = betterAuth({
  appName: "Hunch",
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    /**
     * Sign-in had no "forgot password" and there was no reset route, so a
     * locked-out user had no path back in at all -- and with 2FA on and the
     * backup codes lost, no path at any level.
     */
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Reset your Hunch password",
        text: `Someone asked to reset the password for your Hunch account.\n\nUse this link within the hour:\n${url}\n\nIf it wasn't you, ignore this email — your password stays as it is.`,
      });
    },
    // A reset is a recovery from losing control of the account, so every other
    // session goes with it rather than surviving the new password.
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
  },
  /**
   * Prove the address at sign-up, without making it a gate to sign in: a lost
   * or slow email must not lock a new user out of a trial they came to run.
   * What depends on it is outbound mail — reminders only go to verified
   * addresses (REMINDER_RECIPIENTS), so signing up with someone else's email
   * can't fill a stranger's inbox.
   */
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Confirm your email for Hunch",
        text: `Confirm this is your email so Hunch can send your daily reminders:\n${url}\n\nIf you didn't sign up for Hunch, ignore this email and nothing more will be sent.`,
      });
    },
  },
  // BETTER_AUTH_URL's origin is trusted on its own. On Vercel, also trust the
  // deployment's own URLs so a preview build can sign in at its own address.
  trustedOrigins: [
    // Only for local dev. In production a page on the user's own machine
    // has no business making credentialed auth requests.
    ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000"]),
    ...[
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .filter(Boolean)
      .map((host) => `https://${host}`),
  ],
  // In memory, each serverless instance kept its own counts, so on Vercel a
  // brute force against sign-in, the 2FA code or reset was barely slowed. The
  // database is shared by every instance (table: rateLimit).
  rateLimit: { enabled: true, storage: "database" },
  /**
   * "Continue with Google". Google has already proved the address, so these
   * accounts arrive verified and need no confirmation email — the one sign-up
   * path that works even when outbound mail doesn't. An existing account with
   * the same verified email is linked rather than duplicated; better-auth only
   * links onto a row whose own email is verified (fixed in 1.6.11), so a
   * password account squatting someone's address can't capture their Google
   * sign-in.
   */
  socialProviders: isGoogleConfigured()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
        },
      }
    : {},
  plugins: [
    twoFactor({
      issuer: "Hunch",
      // Email-PIN 2FA: enabling only needs a password (no authenticator to
      // verify against), then a code is emailed at each sign-in.
      skipVerificationOnEnable: true,
      otpOptions: {
        storeOTP: "encrypted",
        period: 5, // minutes the code stays valid
        async sendOTP({ user, otp }) {
          await sendEmail({
            to: user.email,
            subject: "Your Hunch sign-in code",
            text: `Your Hunch code is ${otp}. It expires in 5 minutes. If this wasn't you, ignore this email.`,
          });
        },
      },
    }),
    // nextCookies must be the last plugin.
    nextCookies(),
  ],
});
