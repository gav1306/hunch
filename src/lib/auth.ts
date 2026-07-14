import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";

export const auth = betterAuth({
  appName: "Hunch",
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  trustedOrigins: ["http://localhost:3000"],
  rateLimit: { enabled: true },
  plugins: [
    twoFactor({ issuer: "Hunch" }),
    // nextCookies must be the last plugin.
    nextCookies(),
  ],
});
