import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

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
  trustedOrigins: ["http://localhost:3000"],
  rateLimit: { enabled: true },
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
