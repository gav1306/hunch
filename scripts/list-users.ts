/** Dev-only: list users + their hunch counts. */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const users = await db.user.findMany({
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const u of users) {
    const c = await db.hunch.count({ where: { userId: u.id } });
    console.log(u.email.padEnd(36), "hunches=" + c, u.createdAt.toISOString().slice(0, 10));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
