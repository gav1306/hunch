import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export const auth = betterAuth({
  appName: "Hunch",
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
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
