import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // The CLI (migrate deploy at build) needs a direct connection: Neon's
    // pooled URL runs through PgBouncer, which breaks migrate's advisory lock.
    // The Neon integration on Vercel sets DATABASE_URL_UNPOOLED; locally it is
    // unset and the CLI uses DATABASE_URL. The app itself always uses the
    // pooled DATABASE_URL (src/lib/db.ts).
    url: process.env.DATABASE_URL_UNPOOLED || env("DATABASE_URL"),
  },
});
