/**
 * The public origin, for absolute URLs in share previews, robots and the
 * sitemap. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every build (the
 * production domain, even on a preview); elsewhere BETTER_AUTH_URL is already
 * the app's own origin.
 */
export function siteUrl(): URL {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
}
