import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const TARGETS = [
  "dbg1@example.com",
  "e2e+9681@example.com",
  "twofa1784054108@hunch.app",
  "twofa1784054194@hunch.app",
  "twofa1784054339@hunch.app",
  "uitest1784055846@hunch.app",
];

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const before = await db.user.findMany({ where: { email: { in: TARGETS } }, select: { email: true } });
  console.log("Matched:", before.map((u) => u.email).join(", "));
  const res = await db.user.deleteMany({ where: { email: { in: TARGETS } } });
  console.log("Deleted", res.count, "users (hunches/sessions/accounts cascade).");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
